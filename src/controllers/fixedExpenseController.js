const FixedExpense = require('../models/FixedExpense');
const Expense = require('../models/Expense');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const etiquetaMes = (periodo) => {
  const [y, m] = periodo.split('-').map(Number);
  if (!y || !m) return periodo;
  return `${MESES[m - 1]} ${y}`;
};

// @desc    Obtener todos los gastos fijos (plantillas)
// @route   GET /api/fixed-expenses
// @access  Private
const getFixedExpenses = async (req, res) => {
  try {
    const fixed = await FixedExpense.find().sort({ activo: -1, nombre: 1 });
    res.json(fixed);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener gastos fijos' });
  }
};

// @desc    Crear gasto fijo
// @route   POST /api/fixed-expenses
// @access  Private
const createFixedExpense = async (req, res) => {
  try {
    const fixed = await FixedExpense.create({ ...req.body, usuario: req.user._id });
    res.status(201).json(fixed);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear gasto fijo' });
  }
};

// @desc    Actualizar gasto fijo
// @route   PUT /api/fixed-expenses/:id
// @access  Private
const updateFixedExpense = async (req, res) => {
  try {
    const fixed = await FixedExpense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!fixed) return res.status(404).json({ message: 'Gasto fijo no encontrado' });
    res.json(fixed);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar gasto fijo' });
  }
};

// @desc    Eliminar gasto fijo
// @route   DELETE /api/fixed-expenses/:id
// @access  Private
const deleteFixedExpense = async (req, res) => {
  try {
    const fixed = await FixedExpense.findById(req.params.id);
    if (!fixed) return res.status(404).json({ message: 'Gasto fijo no encontrado' });

    // Eliminar los gastos reales asociados (para que no queden huérfanos)
    const gastoIds = fixed.pagos.filter((p) => p.gastoId).map((p) => p.gastoId);
    if (gastoIds.length > 0) await Expense.deleteMany({ _id: { $in: gastoIds } });

    await FixedExpense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Gasto fijo eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar gasto fijo' });
  }
};

// @desc    Estado de los gastos fijos para un mes determinado
// @route   GET /api/fixed-expenses/status?month=YYYY-MM
// @access  Private
const getMonthStatus = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'Parámetro month inválido (formato YYYY-MM)' });
    }

    const fixed = await FixedExpense.find().sort({ diaVencimiento: 1, nombre: 1 });

    const items = fixed.map((f) => {
      const pago = f.pagoDePeriodo(month);
      return {
        _id: f._id,
        nombre: f.nombre,
        monto: f.monto,
        categoria: f.categoria,
        diaVencimiento: f.diaVencimiento,
        activo: f.activo,
        notas: f.notas,
        pagado: !!pago,
        fechaPago: pago ? pago.fechaPago : null,
        gastoId: pago ? pago.gastoId : null,
      };
    });

    const activos = items.filter((i) => i.activo);
    const total = activos.reduce((sum, i) => sum + i.monto, 0);
    const pagado = activos.filter((i) => i.pagado).reduce((sum, i) => sum + i.monto, 0);

    res.json({
      mes: month,
      mesEtiqueta: etiquetaMes(month),
      total,
      pagado,
      pendiente: total - pagado,
      activos: activos.length,
      pagados: activos.filter((i) => i.pagado).length,
      pendientes: activos.filter((i) => !i.pagado).length,
      items,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al consultar estado de gastos fijos' });
  }
};

// @desc    Marcar un gasto fijo como pagado en un mes (genera el gasto real)
// @route   POST /api/fixed-expenses/:id/pay
// @access  Private
const markPaid = async (req, res) => {
  try {
    const { mes, fechaPago } = req.body;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ message: 'Período inválido (formato YYYY-MM)' });
    }

    const fixed = await FixedExpense.findById(req.params.id);
    if (!fixed) return res.status(404).json({ message: 'Gasto fijo no encontrado' });

    if (fixed.pagoDePeriodo(mes)) {
      return res.status(400).json({ message: `Este gasto ya fue pagado en ${etiquetaMes(mes)}` });
    }

    const fecha = fechaPago ? new Date(fechaPago + 'T00:00:00.000Z') : new Date();

    // Crea el gasto real para que entre en reportes y cierre de caja
    const gasto = await Expense.create({
      descripcion: `${fixed.nombre} · ${etiquetaMes(mes)}`,
      monto: fixed.monto,
      fecha,
      categoria: fixed.categoria,
      notas: `Generado desde Gastos Fijos (${mes})`,
      empleado: req.user._id,
    });

    fixed.pagos.push({
      periodo: mes,
      fechaPago: fecha,
      gastoId: gasto._id,
      usuario: req.user._id,
    });
    await fixed.save();

    res.status(201).json({ fixed, gasto });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al marcar como pagado' });
  }
};

// @desc    Desmarcar un gasto fijo como pagado (elimina el gasto real)
// @route   DELETE /api/fixed-expenses/:id/pay?mes=YYYY-MM
// @access  Private
const markUnpaid = async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ message: 'Período inválido (formato YYYY-MM)' });
    }

    const fixed = await FixedExpense.findById(req.params.id);
    if (!fixed) return res.status(404).json({ message: 'Gasto fijo no encontrado' });

    const idx = fixed.pagos.findIndex((p) => p.periodo === mes);
    if (idx === -1) {
      return res.status(400).json({ message: `Este gasto no estaba pagado en ${etiquetaMes(mes)}` });
    }

    const pago = fixed.pagos[idx];
    // Elimina el gasto real asociado para mantener los reportes coherentes
    if (pago.gastoId) await Expense.findByIdAndDelete(pago.gastoId);

    fixed.pagos.splice(idx, 1);
    await fixed.save();

    res.json({ fixed });
  } catch (error) {
    res.status(500).json({ message: 'Error al desmarcar pago' });
  }
};

module.exports = { getFixedExpenses, createFixedExpense, updateFixedExpense, deleteFixedExpense, getMonthStatus, markPaid, markUnpaid };