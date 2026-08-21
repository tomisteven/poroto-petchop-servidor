const mongoose = require('mongoose');

const loyaltyConfigSchema = new mongoose.Schema({
  singleton: { type: String, default: 'config', unique: true },
  pesosPorPunto: { type: Number, required: true, min: 1, default: 200 }
}, { timestamps: true });

module.exports = mongoose.model('LoyaltyConfig', loyaltyConfigSchema);