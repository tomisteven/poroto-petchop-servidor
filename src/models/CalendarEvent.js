const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descripcion: { type: String },
  tipo: {
    type: String,
    enum: ['tarea', 'recordatorio', 'pago', 'compra', 'servicio', 'nota', 'otro'],
    default: 'tarea'
  },
  fecha: { type: Date, required: true },
  hora: { type: String },
  importe: { type: Number, min: 0 },
  categoria: { type: String },
  estado: { type: String, enum: ['pendiente', 'completado', 'cancelado'], default: 'pendiente' },
  recurrente: {
    activa: { type: Boolean, default: false },
    frecuencia: { type: String, enum: ['diaria', 'semanal', 'quincenal', 'mensual', 'anual'] },
    serieId: { type: String }
  },
  referenciaTipo: { type: String, enum: ['proveedor', 'cliente', 'presupuesto', 'ordenCompra', 'gasto', ''], default: '' },
  referenciaId: { type: mongoose.Schema.Types.ObjectId },
  referenciaNombre: { type: String },
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

calendarEventSchema.index({ fecha: 1 });
calendarEventSchema.index({ tipo: 1 });
calendarEventSchema.index({ serieId: 1 });

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);