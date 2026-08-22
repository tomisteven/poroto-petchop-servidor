const AIFeatureHistory = require('../models/AIFeatureHistory');

const getHistory = async (req, res) => {
  try {
    const { tipo, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (tipo) filter.tipo = tipo;

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      AIFeatureHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).select('-resultado'),
      AIFeatureHistory.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener historial' });
  }
};

const getHistoryItem = async (req, res) => {
  try {
    const item = await AIFeatureHistory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'No encontrado' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

const deleteHistoryItem = async (req, res) => {
  try {
    await AIFeatureHistory.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

const clearHistory = async (req, res) => {
  try {
    const { tipo } = req.query;
    const filter = tipo ? { tipo } : {};
    await AIFeatureHistory.deleteMany(filter);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

module.exports = { getHistory, getHistoryItem, deleteHistoryItem, clearHistory };
