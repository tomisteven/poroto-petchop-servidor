const mongoose = require('mongoose');

const aiFeatureHistorySchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['restock', 'precios', 'clientes', 'tendencias', 'promos', 'chatbot'],
    required: true,
  },
  titulo: { type: String, required: true },
  parametros: { type: mongoose.Schema.Types.Mixed },
  resultado: { type: mongoose.Schema.Types.Mixed, required: true },
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

aiFeatureHistorySchema.index({ tipo: 1, createdAt: -1 });

const AIFeatureHistory = mongoose.model('AIFeatureHistory', aiFeatureHistorySchema);
module.exports = AIFeatureHistory;
