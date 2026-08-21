const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  telefono: { type: String },
  email: { type: String },
  direccion: { type: String },
  esAfiliado: { type: Boolean, default: false },
  puntos: { type: Number, default: 0 },
  fechaAfiliacion: { type: Date },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
