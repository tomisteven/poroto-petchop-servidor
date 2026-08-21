const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  descripcion: { type: String, required: true },
  monto: { type: Number, required: true, min: 0 },
  fecha: { type: Date, default: Date.now },
  categoria: {
    type: String,
    enum: ['alquiler', 'servicios', 'insumos', 'mantenimiento', 'impuestos', 'sueldos', 'otros'],
    default: 'otros'
  },
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notas: { type: String }
}, { timestamps: true });

expenseSchema.index({ fecha: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
