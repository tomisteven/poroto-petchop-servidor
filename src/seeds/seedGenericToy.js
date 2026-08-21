const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const User = require('../models/User');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const seedGenericProduct = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB Atlas\n');

    const admin = await User.findOne({ rol: 'admin' });
    if (!admin) throw new Error('No se encontró usuario admin.');

    let cat = await Category.findOne({ nombre: 'Accesorios y Varios' });
    if (!cat) {
      cat = await Category.create({ nombre: 'Accesorios y Varios', color: '#10b981', icono: 'tag' });
      console.log(`📦 Categoría creada: ${cat.nombre}`);
    }

    const nombre = 'JUGUETE';
    const existente = await Product.findOne({ nombre });
    
    if (existente) {
      console.log(`⚠️  Ya existe: ${nombre}`);
      process.exit(0);
    }

    let skuCounter = 174; // Basado en mi última consulta OTR-173
    const sku = `OTR-${String(skuCounter).padStart(3, '0')}`;

    const prod = await Product.create({
      nombre,
      sku,
      categoria: cat._id,
      precioCompra: 0,
      precioVenta: 0, // Se definirá en el POS
      stock: 9999, // Stock alto para productos genéricos
      stockMinimo: 0,
      unidadMedida: 'unidad',
      esBolsaAlimento: false,
      esGenerico: true, // ESTE ES EL CAMPO CLAVE
      activo: true,
    });

    await StockMovement.create({
      producto: prod._id,
      tipo: 'entrada',
      cantidad: 9999,
      stockAnterior: 0,
      stockNuevo: 9999,
      motivo: 'Carga producto genérico JUGUETE',
      usuario: admin._id,
    });

    console.log(`✅ Producto creado: ${prod.nombre} (SKU: ${prod.sku})`);
    console.log(`   Tipo: Genérico (Pide precio en el POS)`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seedGenericProduct();
