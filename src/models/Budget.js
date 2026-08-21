const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  numero: { type: String, required: true, unique: true },
  fecha: { type: Date, default: Date.now },
  items: [{
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    cantidad: { type: Number, required: true },
    precioUnitario: { type: Number, required: true },
    subtotal: { type: Number, required: true }
  }],
  subtotal: { type: Number, required: true },
  descuento: { type: Number, default: 0 },
  total: { type: Number, required: true },
  clienteNombre: { type: String },
  clienteTelefono: { type: String },
  notas: { type: String },
  estado: { type: String, enum: ['pendiente', 'convertido', 'vencido'], default: 'pendiente' },
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  venta: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' }
}, { timestamps: true });

budgetSchema.index({ numero: -1 });
budgetSchema.index({ fecha: -1 });

module.exports = mongoose.model('Budget', budgetSchema);
