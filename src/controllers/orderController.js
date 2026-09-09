const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');

const generateOrderNumber = async () => {
  const last = await Order.findOne().sort({ createdAt: -1 }).select('numero');
  if (last && last.numero) {
    const num = parseInt(last.numero.replace('PED-', ''), 10) + 1;
    return `PED-${String(num).padStart(4, '0')}`;
  }
  return 'PED-0001';
};

// @desc    Crear pedido público (desde el catálogo)
// @route   POST /api/orders/public
// @access  Public
const createPublicOrder = async (req, res) => {
  try {
    const { clienteNombre, clienteTelefono, items, notas } = req.body;

    if (!clienteNombre || !clienteNombre.trim()) {
      return res.status(400).json({ message: 'Ingresá tu nombre' });
    }
    if (!clienteTelefono || !clienteTelefono.trim()) {
      return res.status(400).json({ message: 'Ingresá tu número de teléfono' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'El pedido debe tener al menos un producto' });
    }

    const phone = clienteTelefono.replace(/\s/g, '');
    let customer = await Customer.findOne({ telefono: phone, activo: true });

    const orderItems = [];
    let total = 0;

    for (const item of items) {
      const product = await Product.findById(item.producto);
      if (!product || !product.activo) continue;

      const esSuelto = !!item.esVentaSuelta;
      const precio = (esSuelto && product.precioKilo && product.precioKilo > 0)
        ? product.precioKilo
        : product.precioVenta;
      const cantidad = Math.max(0.01, parseFloat(item.cantidad) || 1);
      const subtotal = precio * cantidad;

      orderItems.push({
        producto: product._id,
        nombre: product.nombre,
        precio,
        cantidad,
        subtotal,
        unidadMedida: esSuelto ? 'kg' : (product.unidadMedida || 'unidad'),
        esVentaSuelta: esSuelto,
        kilosVendidos: esSuelto ? cantidad : 0,
      });
      total += subtotal;
    }

    if (orderItems.length === 0) {
      return res.status(400).json({ message: 'No se encontraron productos válidos en el pedido' });
    }

    const numero = await generateOrderNumber();

    const order = await Order.create({
      numero,
      clienteNombre: clienteNombre.trim(),
      clienteTelefono: phone,
      cliente: customer ? customer._id : null,
      items: orderItems,
      total,
      notas: notas || '',
    });

    if (customer && !customer.esAfiliado) {
      await Customer.findByIdAndUpdate(customer._id, { esAfiliado: true, fechaAfiliacion: new Date() });
    }

    res.status(201).json({
      numero: order.numero,
      total: order.total,
      clienteNombre: order.clienteNombre,
      clienteAsignado: !!customer,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear el pedido' });
  }
};

// @desc    Obtener todos los pedidos (autenticado)
// @route   GET /api/orders
// @access  Private
const getOrders = async (req, res) => {
  try {
    const { estado, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('cliente', 'nombre telefono email esAfiliado puntos')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments(filter),
    ]);

    res.json({
      items: orders,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener pedidos' });
  }
};

// @desc    Obtener un pedido
// @route   GET /api/orders/:id
// @access  Private
const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('cliente', 'nombre telefono email esAfiliado puntos');
    if (!order) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el pedido' });
  }
};

// @desc    Actualizar estado de un pedido
// @route   PATCH /api/orders/:id/estado
// @access  Private
const updateOrderStatus = async (req, res) => {
  try {
    const { estado } = req.body;
    const valid = ['pendiente', 'confirmado', 'entregado', 'cancelado'];
    if (!valid.includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    ).populate('cliente', 'nombre telefono email esAfiliado puntos');

    if (!order) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el pedido' });
  }
};

// @desc    Marcar pedido como leído
// @route   PATCH /api/orders/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { leido: true });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// @desc    Marcar como enviado por WhatsApp
// @route   PATCH /api/orders/:id/whatsapp
// @access  Private
const markWhatsappSent = async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { whatsappEnviado: true });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// @desc    Contar pedidos no leídos
// @route   GET /api/orders/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const count = await Order.countDocuments({ leido: false });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

module.exports = {
  createPublicOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  markAsRead,
  markWhatsappSent,
  getUnreadCount,
};
