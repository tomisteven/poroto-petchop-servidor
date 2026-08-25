const Investment = require('../models/Investment');

const getInvestments = async (req, res) => {
  try {
    const { startDate, endDate, estado } = req.query;
    const filter = { activo: true };
    if (startDate || endDate) {
      filter.fecha = {};
      if (startDate) filter.fecha.$gte = new Date(startDate);
      if (endDate) filter.fecha.$lte = new Date(endDate + 'T23:59:59.999Z');
    }
    if (estado) filter.estado = estado;
    const investments = await Investment.find(filter)
      .populate('empleado', 'nombre')
      .sort({ fecha: -1 });
    res.json(investments);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener inversiones' });
  }
};

const getInvestment = async (req, res) => {
  try {
    const investment = await Investment.findById(req.params.id).populate('empleado', 'nombre');
    if (!investment || !investment.activo) return res.status(404).json({ message: 'Inversión no encontrada' });
    res.json(investment);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener inversión' });
  }
};

const createInvestment = async (req, res) => {
  try {
    const investment = await Investment.create({ ...req.body, empleado: req.user._id });
    const populated = await investment.populate('empleado', 'nombre');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear inversión' });
  }
};

const updateInvestment = async (req, res) => {
  try {
    const investment = await Investment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('empleado', 'nombre');
    if (!investment) return res.status(404).json({ message: 'Inversión no encontrada' });
    res.json(investment);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar inversión' });
  }
};

const updateInvestmentStatus = async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['pendiente', 'completado', 'cancelado'].includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }
    const investment = await Investment.findByIdAndUpdate(req.params.id, { estado }, { new: true })
      .populate('empleado', 'nombre');
    if (!investment) return res.status(404).json({ message: 'Inversión no encontrada' });
    res.json(investment);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar inversión' });
  }
};

const deleteInvestment = async (req, res) => {
  try {
    const investment = await Investment.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });
    if (!investment) return res.status(404).json({ message: 'Inversión no encontrada' });
    res.json({ message: 'Inversión eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar inversión' });
  }
};

module.exports = { getInvestments, getInvestment, createInvestment, updateInvestment, updateInvestmentStatus, deleteInvestment };
