const AIHistory = require('../models/AIHistory');

// @desc    Obtener historial de consultas IA del usuario
// @route   GET /api/ai-history
// @access  Private
const getHistory = async (req, res) => {
  try {
    const { tipo, page = 1, limit = 20 } = req.query;
    const filter = { empleado: req.user._id, activo: true };
    if (tipo) filter.tipo = tipo;

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      AIHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      AIHistory.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener historial' });
  }
};

// @desc    Obtener una entrada del historial
// @route   GET /api/ai-history/:id
// @access  Private
const getHistoryItem = async (req, res) => {
  try {
    const item = await AIHistory.findOne({ _id: req.params.id, empleado: req.user._id });
    if (!item) {
      return res.status(404).json({ message: 'Entrada no encontrada' });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la entrada' });
  }
};

// @desc    Guardar una entrada en el historial
// @route   POST /api/ai-history
// @access  Private
const createHistory = async (req, res) => {
  try {
    const { tipo, titulo, consulta, referencia, fuente, resultado } = req.body;

    if (!tipo || !consulta || !resultado) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    const item = await AIHistory.create({
      tipo,
      titulo: titulo || consulta.slice(0, 80),
      consulta,
      referencia,
      fuente,
      resultado,
      empleado: req.user._id,
    });

    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar en historial' });
  }
};

// @desc    Eliminar una entrada del historial (soft delete)
// @route   DELETE /api/ai-history/:id
// @access  Private
const deleteHistory = async (req, res) => {
  try {
    const item = await AIHistory.findOneAndUpdate(
      { _id: req.params.id, empleado: req.user._id },
      { activo: false },
      { new: true }
    );
    if (!item) {
      return res.status(404).json({ message: 'Entrada no encontrada' });
    }
    res.json({ message: 'Eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar' });
  }
};

module.exports = { getHistory, getHistoryItem, createHistory, deleteHistory };
