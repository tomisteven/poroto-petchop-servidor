const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  numero: { type: String, required: true, unique: true },
  proveedor: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  fecha: { type: Date, default: Date.now },
  items: [{
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    cantidad: { type: Number, required: true, min: 0 },
    precioUnitario: { type: Number, required: true, min: 0 }
  }],
  total: { type: Number, required: true },
  estado: { type: String, enum: ['pendiente', 'recibida', 'cancelada'], default: 'pendiente' },
  notas: { type: String }
}, { timestamps: true });

purchaseOrderSchema.index({ numero: -1 });
purchaseOrderSchema.index({ fecha: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
