const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');

const generateOrderNumber = async () => {
  const last = await PurchaseOrder.findOne().sort({ numero: -1 });
  const num = last ? parseInt(last.numero.split('-')[1]) + 1 : 1;
  return `OC-${String(num).padStart(4, '0')}`;
};

const getPurchaseOrders = async (req, res) => {
  try {
    const { estado } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;
    const orders = await PurchaseOrder.find(filter)
      .populate('proveedor', 'nombre')
      .populate('items.producto', 'nombre sku')
      .sort({ fecha: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener órdenes de compra' });
  }
};

const getPurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('proveedor', 'nombre telefono email')
      .populate('items.producto', 'nombre sku precioCompra');
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener orden' });
  }
};

const createPurchaseOrder = async (req, res) => {
  try {
    const { proveedor, items, notas } = req.body;
    const total = items.reduce((sum, i) => sum + (i.cantidad * i.precioUnitario), 0);
    const numero = await generateOrderNumber();
    const order = await PurchaseOrder.create({ numero, proveedor, items, total, notas });
    const populated = await order.populate('proveedor', 'nombre');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear orden de compra' });
  }
};

const receivePurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });
    if (order.estado !== 'pendiente') return res.status(400).json({ message: 'Solo órdenes pendientes pueden recibirse' });

    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.producto, { $inc: { stock: item.cantidad } });
    }

    order.estado = 'recibida';
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error al recibir orden' });
  }
};

const cancelPurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });
    order.estado = 'cancelada';
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error al cancelar orden' });
  }
};

module.exports = { getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder };
