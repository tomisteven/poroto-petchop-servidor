const Budget = require('../models/Budget');
const Sale = require('../models/Sale');
const generateTicketNumber = require('../utils/generateTicketNumber');

const generateBudgetNumber = async () => {
  const last = await Budget.findOne().sort({ numero: -1 });
  const num = last ? parseInt(last.numero.split('-')[1]) + 1 : 1;
  return `P-${String(num).padStart(4, '0')}`;
};

const getBudgets = async (req, res) => {
  try {
    const { estado } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;
    const budgets = await Budget.find(filter)
      .populate('items.producto', 'nombre sku imagen')
      .populate('empleado', 'nombre')
      .sort({ fecha: -1 });
    res.json(budgets);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener presupuestos' });
  }
};

const getBudget = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate('items.producto', 'nombre sku imagen precioVenta')
      .populate('empleado', 'nombre')
      .populate('venta');
    if (!budget) return res.status(404).json({ message: 'Presupuesto no encontrado' });
    res.json(budget);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener presupuesto' });
  }
};

const createBudget = async (req, res) => {
  try {
    const { items, descuento, clienteNombre, clienteTelefono, notas } = req.body;
    const subtotal = items.reduce((sum, i) => sum + (i.cantidad * i.precioUnitario), 0);
    const descuentoAplicado = Math.min(Math.max(descuento || 0, 0), 100);
    const total = subtotal * (1 - descuentoAplicado / 100);
    const numero = await generateBudgetNumber();
    const budget = await Budget.create({
      numero, items, subtotal, descuento: descuentoAplicado, total,
      clienteNombre, clienteTelefono, notas, empleado: req.user._id
    });
    const populated = await budget.populate([
      { path: 'items.producto', select: 'nombre sku' },
      { path: 'empleado', select: 'nombre' }
    ]);
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear presupuesto' });
  }
};

const convertToSale = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ message: 'Presupuesto no encontrado' });
    if (budget.estado !== 'pendiente') return res.status(400).json({ message: 'El presupuesto no está pendiente' });

    const items = budget.items.map(i => ({
      producto: i.producto,
      cantidad: i.cantidad,
      precioVentaHisto: i.precioUnitario,
      precioCompraHisto: 0,
      subtotal: i.subtotal,
      esVentaSuelta: false
    }));

    const numeroTicket = await generateTicketNumber();
    const sale = await Sale.create({
      numeroTicket,
      empleado: req.user._id,
      items,
      subtotal: budget.subtotal,
      descuento: budget.descuento,
      totalFinal: budget.total,
      metodoPago: 'efectivo',
      montoPagado: budget.total,
      vuelto: 0,
      notas: `Convertido de presupuesto ${budget.numero}`
    });

    budget.estado = 'convertido';
    budget.venta = sale._id;
    await budget.save();

    const populated = await Budget.findById(budget._id)
      .populate('items.producto', 'nombre sku')
      .populate('empleado', 'nombre');
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Error al convertir presupuesto' });
  }
};

const deleteBudget = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ message: 'Presupuesto no encontrado' });
    if (budget.estado === 'convertido') return res.status(400).json({ message: 'No se puede eliminar un presupuesto convertido' });
    budget.estado = 'vencido';
    await budget.save();
    res.json({ message: 'Presupuesto cancelado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al cancelar presupuesto' });
  }
};

module.exports = { getBudgets, getBudget, createBudget, convertToSale, deleteBudget };
