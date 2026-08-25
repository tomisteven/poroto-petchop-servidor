const mongoose = require('mongoose');

const investmentItemSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  cantidad: { type: Number, default: 1, min: 1 },
  valorUnitario: { type: Number, min: 0 },
  valorTotal: { type: Number, min: 0 }
}, { _id: false });

const investmentSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descripcion: { type: String },
  fecha: { type: Date, required: true },
  items: [investmentItemSchema],
  valorTotal: { type: Number, min: 0 },
  estado: { type: String, enum: ['pendiente', 'completado', 'cancelado'], default: 'pendiente' },
  notas: { type: String },
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

investmentSchema.index({ fecha: -1 });
investmentSchema.index({ estado: 1 });

module.exports = mongoose.model('Investment', investmentSchema);
