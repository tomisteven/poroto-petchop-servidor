const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Redemption = require('../models/Redemption');

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Fechas en hora de Argentina (UTC-3), mismo criterio que sales/report controllers
const argDate = (value, endOfDay) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (typeof value === 'string' && value.length <= 10) {
    if (endOfDay) d.setUTCHours(26, 59, 59, 999);
    else d.setUTCHours(3, 0, 0, 0);
  }
  return d;
};

const getCustomers = async (req, res) => {
  try {
    const { all } = req.query;
    const filter = all ? {} : { activo: true };
    const customers = await Customer.find(filter).sort({ nombre: 1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener clientes' });
  }
};

const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener cliente' });
  }
};

const createCustomer = async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear cliente' });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar cliente' });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar cliente' });
  }
};

// @desc    Buscar clientes rápido + resumen de compras (POS + pedidos web)
// @route   GET /api/customers/buscar?q=&limit=&all=
const searchCustomers = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 300);
    const filter = {};
    if (req.query.all !== 'true') filter.activo = true;
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ nombre: re }, { telefono: re }, { email: re }];
    }

    const customers = await Customer.find(filter).sort({ nombre: 1 }).limit(limit);
    const ids = customers.map(c => c._id);
    const telefonos = customers.map(c => c.telefono).filter(Boolean);

    const [ventasAgg, pedidosAgg] = await Promise.all([
      Sale.aggregate([
        { $match: { cliente: { $in: ids }, estado: 'completada' } },
        { $group: { _id: '$cliente', gastado: { $sum: '$totalFinal' }, compras: { $sum: 1 }, ultima: { $max: '$fecha' } } }
      ]),
      telefonos.length
        ? Order.aggregate([
            { $match: { clienteTelefono: { $in: telefonos }, estado: { $ne: 'cancelado' } } },
            { $group: { _id: '$clienteTelefono', gastado: { $sum: '$total' }, compras: { $sum: 1 }, ultima: { $max: '$createdAt' } } }
          ])
        : []
    ]);

    const ventasMap = new Map(ventasAgg.map(v => [String(v._id), v]));
    const pedidosMap = new Map(pedidosAgg.map(p => [p._id, p]));

    const resultado = customers.map(c => {
      const v = ventasMap.get(String(c._id)) || {};
      const p = pedidosMap.get(c.telefono) || {};
      const fechas = [v.ultima, p.ultima].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
      return {
        _id: c._id,
        nombre: c.nombre,
        telefono: c.telefono,
        email: c.email,
        esAfiliado: c.esAfiliado,
        puntos: c.puntos,
        activo: c.activo,
        totalGastado: (v.gastado || 0) + (p.gastado || 0),
        totalCompras: (v.compras || 0) + (p.compras || 0),
        comprasPos: v.compras || 0,
        pedidosWeb: p.compras || 0,
        ultimaCompra: fechas[0] || null
      };
    });

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ message: 'Error al buscar clientes' });
  }
};

// @desc    Historial completo de compras de un cliente con filtros
// @route   GET /api/customers/:id/historial?startDate=&endDate=&q=&metodoPago=&page=&limit=
const getCustomerHistory = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });

    const { startDate, endDate, metodoPago } = req.query;
    const texto = (req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    // Productos que matchean el texto (para items.nombre, que solo se llena en promos)
    let prodIds = [];
    let textoRe = null;
    if (texto) {
      textoRe = new RegExp(escapeRegex(texto), 'i');
      const prods = await Product.find({ $or: [{ nombre: textoRe }, { sku: textoRe }] }).select('_id').lean();
      prodIds = prods.map(p => p._id);
    }

    const saleMatch = { cliente: customer._id, estado: 'completada' };
    if (textoRe) {
      const itemConds = [{ nombre: textoRe }];
      if (prodIds.length) itemConds.unshift({ producto: { $in: prodIds } });
      saleMatch.items = { $elemMatch: { $or: itemConds } };
    }
    const desde = startDate ? argDate(startDate, false) : null;
    const hasta = endDate ? argDate(endDate, true) : null;
    if (desde || hasta) {
      saleMatch.fecha = {};
      if (desde) saleMatch.fecha.$gte = desde;
      if (hasta) saleMatch.fecha.$lte = hasta;
    }
    if (metodoPago) saleMatch.metodoPago = metodoPago;

    const resumenAgg = await Sale.aggregate([
      { $match: saleMatch },
      {
        $group: {
          _id: null,
          compras: { $sum: 1 },
          gastado: { $sum: '$totalFinal' },
          items: { $sum: { $size: { $ifNull: ['$items', []] } } },
          primera: { $min: '$fecha' },
          ultima: { $max: '$fecha' }
        }
      }
    ]);

    const productosAgg = await Sale.aggregate([
      { $match: saleMatch },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.producto', foreignField: '_id', as: 'prod' } },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      ...(textoRe
        ? [{ $match: { $or: [{ 'prod._id': { $in: prodIds } }, { 'items.nombre': textoRe }] } }]
        : []),
      {
        $group: {
          _id: '$prod._id',
          nombre: { $first: { $ifNull: ['$prod.nombre', '$items.nombre'] } },
          veces: { $sum: 1 },
          cantidad: { $sum: '$items.cantidad' },
          kilos: { $sum: { $ifNull: ['$items.kilosVendidos', 0] } },
          gastado: { $sum: '$items.subtotal' },
          ultima: { $max: '$fecha' }
        }
      },
      { $sort: { veces: -1, gastado: -1 } },
      { $limit: 100 }
    ]);

    const total = await Sale.countDocuments(saleMatch);
    const ventas = await Sale.find(saleMatch)
      .populate('empleado', 'nombre')
      .populate('items.producto', 'nombre sku')
      .sort({ fecha: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Pedidos del catálogo online (por referencia o por teléfono)
    const orderConds = [{ cliente: customer._id }];
    const digits = (customer.telefono || '').replace(/\D/g, '');
    if (digits.length >= 6) orderConds.push({ clienteTelefono: { $regex: digits } });
    const orderMatch = { $or: orderConds };
    if (desde || hasta) {
      orderMatch.createdAt = {};
      if (desde) orderMatch.createdAt.$gte = desde;
      if (hasta) orderMatch.createdAt.$lte = hasta;
    }
    if (textoRe) {
      const cond = [{ 'items.nombre': textoRe }];
      if (prodIds.length) cond.unshift({ 'items.producto': { $in: prodIds } });
      orderMatch.items = { $elemMatch: { $or: cond } };
    }
    const pedidos = await Order.find(orderMatch).sort({ createdAt: -1 }).limit(100);

    const canjes = await Redemption.find({ cliente: customer._id })
      .populate('recompensa', 'nombre tipo')
      .populate('empleado', 'nombre')
      .sort({ fecha: -1 })
      .limit(50);

    const r = resumenAgg[0] || {};
    const pedidosActivos = pedidos.filter(p => p.estado !== 'cancelado');
    res.json({
      cliente: customer,
      resumen: {
        compras: r.compras || 0,
        gastado: r.gastado || 0,
        items: r.items || 0,
        ticketPromedio: r.compras ? (r.gastado || 0) / r.compras : 0,
        primeraCompra: r.primera || null,
        ultimaCompra: r.ultima || null,
        pedidosWeb: pedidosActivos.length,
        gastadoPedidosWeb: pedidosActivos.reduce((acc, p) => acc + (p.total || 0), 0),
        puntos: customer.puntos || 0,
        esAfiliado: !!customer.esAfiliado
      },
      productos: productosAgg,
      ventas,
      pedidos,
      canjes,
      total,
      page,
      pages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    console.error('Error historial cliente:', error);
    res.status(500).json({ message: 'Error al obtener el historial del cliente' });
  }
};

module.exports = { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, searchCustomers, getCustomerHistory };
