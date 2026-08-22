const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  nombre: { type: String, required: true },
  precio: { type: Number, required: true },
  cantidad: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  numero: { type: String, unique: true },
  clienteNombre: { type: String, required: true },
  clienteTelefono: { type: String, required: true },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  items: [orderItemSchema],
  total: { type: Number, required: true },
  notas: { type: String },
  estado: {
    type: String,
    enum: ['pendiente', 'confirmado', 'entregado', 'cancelado'],
    default: 'pendiente',
  },
  leido: { type: Boolean, default: false },
  whatsappEnviado: { type: Boolean, default: false },
}, { timestamps: true });

orderSchema.index({ createdAt: -1 });
orderSchema.index({ estado: 1 });
orderSchema.index({ clienteTelefono: 1 });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
