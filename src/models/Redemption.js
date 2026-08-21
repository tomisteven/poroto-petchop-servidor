const mongoose = require('mongoose');

const redemptionSchema = new mongoose.Schema({
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  recompensa: { type: mongoose.Schema.Types.ObjectId, ref: 'LoyaltyReward', required: true },
  puntosUsados: { type: Number, required: true, min: 1 },
  fecha: { type: Date, default: Date.now },
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notas: { type: String }
}, { timestamps: true });

redemptionSchema.index({ fecha: -1 });

module.exports = mongoose.model('Redemption', redemptionSchema);