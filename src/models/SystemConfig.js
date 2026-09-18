const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  singleton: { type: String, default: 'config', unique: true },
  metaFacturacionDiaria: { type: Number, default: 40000, min: 0 },
  metaGananciaDiaria: { type: Number, default: 30000, min: 0 },
  metaFacturacionMensual: { type: Number, default: 4000000, min: 0 },
  margenSueltoDefecto: { type: Number, default: 42, min: 0 },
  pesosPorPunto: { type: Number, default: 200, min: 1 },
}, { timestamps: true });

module.exports = mongoose.model('SystemConfig', systemConfigSchema);