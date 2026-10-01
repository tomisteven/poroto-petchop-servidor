const mongoose = require('mongoose');

const pagoSchema = new mongoose.Schema({
  // Período en formato "YYYY-MM" (ej: "2026-09")
  periodo: { type: String, required: true },
  fechaPago: { type: Date, default: Date.now },
  // Gastos real generado al pagar (para que entre en reportes)
  gastoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const fixedExpenseSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  monto: { type: Number, required: true, min: 0 },
  categoria: {
    type: String,
    enum: ['alquiler', 'servicios', 'insumos', 'mantenimiento', 'impuestos', 'sueldos', 'otros', 'caja'],
    default: 'otros'
  },
  // Día del mes en el que suele vencer (opcional, 1-31)
  diaVencimiento: { type: Number, min: 1, max: 31 },
  activo: { type: Boolean, default: true },
  notas: { type: String },
  pagos: [pagoSchema]
}, { timestamps: true });

// Índice para no duplicar pagos del mismo período por gasto fijo
fixedExpenseSchema.index({ _id: 1, 'pagos.periodo': 1 }, { unique: true });

fixedExpenseSchema.methods.pagoDePeriodo = function (periodo) {
  return this.pagos.find((p) => p.periodo === periodo) || null;
};

module.exports = mongoose.model('FixedExpense', fixedExpenseSchema);