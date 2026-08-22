const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
    },
    descripcion: {
      type: String,
    },
    sku: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    categoria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    precioCompra: {
      type: Number,
      required: true,
      min: 0,
    },
    precioVenta: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
    },
    stockMinimo: {
      type: Number,
      default: 5,
    },
    unidadMedida: {
      type: String,
      default: 'unidad', // unidad, kg, litro, etc.
    },
    proveedor: {
      type: String, // O ref a un modelo Supplier
    },
    imagen: {
      type: String, // URL de imagen o base64
    },
    activo: {
      type: Boolean,
      default: true,
    },
    esBolsaAlimento: {
      type: Boolean,
      default: false,
    },
    kilosPorBolsa: {
      type: Number,
    },
    precioKilo: {
      type: Number,
      min: 0,
      default: null, // Precio EXACTO del kilo suelto (si se define, se usa tal cual en el POS)
    },
    margenSuelto: {
      type: Number,
      default: 42, // Margen extra por venta suelta en %
    },
    esGenerico: {
      type: Boolean,
      default: false,
    },
    notasIA: {
      type: String,
      default: '',
    },
    esCombo: {
      type: Boolean,
      default: false,
    },
    comboItems: [{
      producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      cantidad: { type: Number, required: true, default: 1 },
      hayStock: { type: Boolean, default: false },
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual property para calcular el margen de ganancia automáticamente
// Fórmula solicitada: ((precioVenta - precioCompra) / precioVenta) * 100
productSchema.virtual('margenGanancia').get(function () {
  if (this.precioVenta === 0) return 0;
  return ((this.precioVenta - this.precioCompra) / this.precioVenta) * 100;
});

// Virtual: indica si el combo se puede vender (todos los items con stock)
productSchema.virtual('comboVendible').get(function () {
  if (!this.esCombo || !this.comboItems?.length) return true;
  return this.comboItems.every(item => item.hayStock === true);
});

// Método para actualizar disponibilidad del combo según stock actual
productSchema.methods.actualizarDisponibilidadCombo = async function () {
  if (!this.esCombo) return true;
  const Product = this.constructor;
  const items = this.comboItems;
  let allAvailable = true;
  
  for (const item of items) {
    const prod = await Product.findById(item.producto);
    const disponible = prod && prod.stock >= item.cantidad;
    if (item.hayStock !== disponible) {
      item.hayStock = disponible;
      allAvailable = false;
    }
  }
  
  if (!allAvailable) {
    await this.save();
  }
  return this.comboItems.every(item => item.hayStock);
};

// Static method: genera SKU único automáticamente
productSchema.statics.generarSKU = async function (nombre, esCombo = false) {
  const prefijo = esCombo ? 'COMBO' : 'PROD';
  const base = nombre
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  let sku = `${prefijo}-${base}-${Date.now().toString(36).toUpperCase()}`;
  let existe = await this.findOne({ sku });
  let counter = 1;
  while (existe) {
    sku = `${prefijo}-${base}-${Date.now().toString(36).toUpperCase()}-${counter}`;
    existe = await this.findOne({ sku });
    counter++;
  }
  return sku;
};

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
