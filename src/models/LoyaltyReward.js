const mongoose = require('mongoose');

const loyaltyRewardSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  tipo: {
    type: String,
    enum: ['efectivo', 'porcentaje', 'producto', 'regalo'],
    required: true
  },
  valor: { type: Number, min: 0 },
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  puntosRequeridos: { type: Number, required: true, min: 1 },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('LoyaltyReward', loyaltyRewardSchema);