const Expense = require('../models/Expense');

const getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, categoria } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.fecha = {};
      if (startDate) filter.fecha.$gte = new Date(startDate);
      if (endDate) filter.fecha.$lte = new Date(endDate + 'T23:59:59.999Z');
    }
    if (categoria) filter.categoria = categoria;
    const expenses = await Expense.find(filter)
      .populate('empleado', 'nombre')
      .sort({ fecha: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener gastos' });
  }
};

const getExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).populate('empleado', 'nombre');
    if (!expense) return res.status(404).json({ message: 'Gasto no encontrado' });
    res.json(expense);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener gasto' });
  }
};

const createExpense = async (req, res) => {
  try {
    const expense = await Expense.create({ ...req.body, empleado: req.user._id });
    const populated = await expense.populate('empleado', 'nombre');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear gasto' });
  }
};

const updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('empleado', 'nombre');
    if (!expense) return res.status(404).json({ message: 'Gasto no encontrado' });
    res.json(expense);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar gasto' });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Gasto no encontrado' });
    res.json({ message: 'Gasto eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar gasto' });
  }
};

module.exports = { getExpenses, getExpense, createExpense, updateExpense, deleteExpense };
