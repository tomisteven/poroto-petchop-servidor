const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  contacto: { type: String },
  telefono: { type: String },
  email: { type: String },
  direccion: { type: String },
  cbu: { type: String },
  productos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  observaciones: { type: String },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Supplier', supplierSchema);
