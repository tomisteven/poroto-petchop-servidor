const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    numero: {
      type: String,
      required: true,
      unique: true,
    },
    nombre: {
      type: String,
      required: true,
    },
    descripcion: {
      type: String,
    },
    productoPrincipal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    items: [
      {
        producto: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        cantidad: {
          type: Number,
          required: true,
          min: 0,
        },
        precioVenta: { // Snapshot del precio de venta al crear la promoción
          type: Number,
          required: true,
          min: 0,
        },
        precioCompra: { // Snapshot del costo al crear la promoción
          type: Number,
          required: true,
          min: 0,
        },
        subtotal: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    subtotalCosto: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotalVenta: {
      type: Number,
      required: true,
      min: 0,
    },
    descuento: {
      type: Number,
      default: 0, // Porcentaje 0 a 100 sobre el subtotal de venta
    },
    precioFinal: {
      type: Number,
      required: true,
      min: 0,
    },
    ganancia: {
      type: Number,
      required: true,
    },
    margen: {
      type: Number,
      required: true, // Porcentaje de ganancia sobre precioFinal
    },
    estado: {
      type: String,
      enum: ['activa', 'pausada'],
      default: 'activa',
    },
    empleado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notas: {
      type: String,
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

promotionSchema.index({ numero: -1 });

const Promotion = mongoose.model('Promotion', promotionSchema);
module.exports = Promotion;