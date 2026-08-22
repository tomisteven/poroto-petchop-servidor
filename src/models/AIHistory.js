const mongoose = require('mongoose');

const aiHistorySchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['catalogo', 'internet', 'comparar'],
    required: true,
  },
  titulo: { type: String, required: true },
  consulta: { type: String, required: true },
  referencia: { type: String },
  fuente: { type: String, enum: ['ia', 'local'] },
  resultado: { type: mongoose.Schema.Types.Mixed, required: true },
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

aiHistorySchema.index({ empleado: 1, createdAt: -1 });
aiHistorySchema.index({ tipo: 1 });

module.exports = mongoose.model('AIHistory', aiHistorySchema);
