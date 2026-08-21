const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const User = require('../models/User');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const parsePrice = (str) => {
  // "$ 53.500,00" -> 53500
  return parseFloat(str.replace(/\$|\s|\./g, '').replace(',', '.'));
};

const alimentosData = [
  // Gatos Kitten
  { nombre: 'Performance Kitten', kilos: 7.5, costo: 53500 },
  { nombre: 'Excellent Kitten', kilos: 7.5, costo: 54800 },
  { nombre: 'Cat Chow Gatito', kilos: 15, costo: 72500 },
  { nombre: 'Eukanuba Kitten', kilos: 7.5, costo: 51200 },
  { nombre: 'Raza Gatito', kilos: 8, costo: 19400 },
  { nombre: 'Vital Hop Kitten', kilos: 7.5, costo: 14700 },
  { nombre: 'Vagoneta', kilos: 10, costo: 19050 },
  { nombre: 'Whiskas Gatito', kilos: 10, costo: 37400 },
  { nombre: 'Royal Fit 32', kilos: 15, costo: 125000 },
  { nombre: 'Deleita Gato', kilos: 8, costo: 26200 },
  // Gatos Adulto
  { nombre: 'Performance Gato Adulto', kilos: 7.5, costo: 49800 },
  { nombre: 'Excellent Gato Adulto', kilos: 15, costo: 95500 },
  { nombre: 'Eukanuba Gato Adulto', kilos: 15, costo: 64200 },
  { nombre: 'Gati', kilos: 15, costo: 38300 },
  { nombre: 'Cat Chow Adulto', kilos: 15, costo: 66200 },
  { nombre: 'Felix Gato', kilos: 15, costo: 57800 },
  { nombre: 'Maintenance Gato', kilos: 15, costo: 27900 },
  { nombre: 'Raza Gato Adulto', kilos: 15, costo: 31000 },
  { nombre: 'Argento Gato', kilos: 10, costo: 20900 },
  { nombre: 'Kongo Gato', kilos: 15, costo: 35800 },
  { nombre: 'Vital Complete Senior Gato', kilos: 7.5, costo: 32500 },
  { nombre: 'Vital Complete Gato', kilos: 24, costo: 85400 },
  { nombre: 'Sabrositos Gato', kilos: 20, costo: 31680 },
  { nombre: 'Vital Balanced Gato', kilos: 15, costo: 84500 },
  { nombre: 'Vital Premium Gato', kilos: 24, costo: 81900 },
  { nombre: 'Nutribon Gato', kilos: 20, costo: 28600 },
  { nombre: 'Gaucho Gato', kilos: 15, costo: 24400 },
  { nombre: 'Whiskas', kilos: 20, costo: 63500 },
  // Gatos Castrados
  { nombre: 'Raza Castrados', kilos: 10, costo: 26050 },
  { nombre: 'Excellent Castrados', kilos: 7.5, costo: 57000 },
  // Gatos Urinario
  { nombre: 'Nutribon Urinary', kilos: 8, costo: 22800 },
  { nombre: 'Cat Selection Urinary', kilos: 10, costo: 41730 },
  { nombre: 'Vital Premium Urinary', kilos: 7.5, costo: 29100 },
  { nombre: 'Agility Urinary', kilos: 10, costo: 50000 },
  { nombre: 'Excellent Urinary', kilos: 15, costo: 110000 },
  // Perros Adulto Pequeño
  { nombre: 'Maintenance Adulto Pequeño', kilos: 15, costo: 19400 },
  { nombre: 'Eukanuba Adulto Pequeño', kilos: 15, costo: 57000 },
  { nombre: 'Dog Selection Adulto Pequeño', kilos: 15, costo: 30400 },
  { nombre: 'Biopet Adulto Pequeño', kilos: 15, costo: 17500 },
  { nombre: 'Vital Balanced Adulto Pequeño', kilos: 15, costo: 46700 },
  { nombre: 'Argento Adulto Pequeño', kilos: 15, costo: 20900 },
  { nombre: 'Vital Premium Cordero', kilos: 20, costo: 43000 },
  { nombre: 'Dog Selection Dermatologico', kilos: 15, costo: 41730 },
  { nombre: 'Excellent Adulto Pequeño', kilos: 15, costo: 53700 },
  { nombre: 'Sieger Mini Adulto', kilos: 12, costo: 56800 },
  { nombre: 'Dog Chow Adulto Pequeño', kilos: 20, costo: 49600 },
  { nombre: 'Vital Complete Adulto Pequeño', kilos: 20, costo: 43500 },
  { nombre: 'Royal Mini Adulto', kilos: 15, costo: 91000 },
  { nombre: 'Deleita Adulto Pequeño', kilos: 10, costo: 25800 },
  { nombre: 'Pedigree Adulto Pequeño', kilos: 15, costo: 38100 },
  { nombre: 'Proplan Adulto Pequeño', kilos: 7.5, costo: 58200 },
  // Perros Adulto Grande
  { nombre: 'Maintenance Adulto', kilos: 22, costo: 25300 },
  { nombre: 'Dog Chow Adulto', kilos: 20, costo: 46900 },
  { nombre: 'Excellent Adulto', kilos: 20, costo: 49800 },
  { nombre: 'Argento Adulto', kilos: 20, costo: 24600 },
  { nombre: 'Dog Selection Adulto', kilos: 21, costo: 40530 },
  { nombre: 'Eukanuba Adulto', kilos: 15, costo: 55000 },
  { nombre: 'Performance Adulto', kilos: 20, costo: 68000 },
  { nombre: 'Deleita Criadores', kilos: 22, costo: 51500 },
  { nombre: 'Sieger Criadores', kilos: 20, costo: 65600 },
  { nombre: 'Biopet Cordero', kilos: 20, costo: 25380 },
  { nombre: 'Nutribon Adulto', kilos: 20, costo: 19700 },
  { nombre: 'Rosco Cocktail', kilos: 22, costo: 24400 },
  { nombre: 'Vital Premium Adulto', kilos: 24, costo: 43500 },
  { nombre: 'Zimpi', kilos: 25, costo: 18000 },
  { nombre: 'Pedigree Adulto', kilos: 21, costo: 48000 },
  { nombre: 'Vital Balanced Adulto', kilos: 20, costo: 54900 },
  { nombre: 'Sabrositos Adulto', kilos: 20, costo: 20840 },
  { nombre: 'Raza Adulto', kilos: 21, costo: 26600 },
  // Perros Cachorro/Puppy
  { nombre: 'Sieger Puppy', kilos: 12, costo: 61800 },
  { nombre: 'Dog Selection Cachorro', kilos: 15, costo: 34400 },
  { nombre: 'Vital Premium Junior', kilos: 15, costo: 42000 },
  { nombre: 'Biopet Cachorro', kilos: 15, costo: 22680 },
  { nombre: 'Dog Chow Cachorro', kilos: 21, costo: 56100 },
  { nombre: 'Eukanuba Puppy MB', kilos: 15, costo: 61000 },
  { nombre: 'Eukanuba Puppy SB', kilos: 15, costo: 64100 },
  { nombre: 'Maintenance Cachorro', kilos: 15, costo: 22000 },
  { nombre: 'Argento Cachorro', kilos: 15, costo: 25500 },
  { nombre: 'Performance Junior', kilos: 15, costo: 63900 },
  { nombre: 'Royal Mini Puppy', kilos: 15, costo: 107300 },
  { nombre: 'Proplan Puppy', kilos: 7.5, costo: 64200 },
  { nombre: 'Deleita Cachorro', kilos: 15, costo: 47600 },
  { nombre: 'Pedigree Cachorro', kilos: 21, costo: 51000 },
];

const seedAlimentos = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB Atlas');

    // Buscar o crear categorías necesarias
    let catAlimentos = await Category.findOne({ nombre: 'Alimentos' });
    if (!catAlimentos) {
      catAlimentos = await Category.create({ nombre: 'Alimentos', color: '#f97316', icono: 'package' });
      console.log('📦 Categoría "Alimentos" creada');
    } else {
      console.log('📦 Categoría "Alimentos" ya existía');
    }

    // Obtener admin para el movimiento de stock inicial
    const admin = await User.findOne({ rol: 'admin' });
    if (!admin) {
      throw new Error('No se encontró un usuario admin. Ejecutá createAdmin.js primero.');
    }

    let creados = 0;
    let omitidos = 0;
    const stockMovements = [];

    for (let i = 0; i < alimentosData.length; i++) {
      const a = alimentosData[i];

      // SKU generado automáticamente: MAL-001, MAL-002, etc.
      const sku = `MAL-${String(i + 1).padStart(3, '0')}`;

      const existente = await Product.findOne({ nombre: { $regex: new RegExp(`^${a.nombre}$`, 'i') } });
      if (existente) {
        console.log(`  ⚠️  Ya existe: ${a.nombre} (omitido)`);
        omitidos++;
        continue;
      }

      // precioVenta = mismo que costo (el usuario puede actualizarlo desde el panel)
      const prod = await Product.create({
        nombre: a.nombre,
        sku,
        categoria: catAlimentos._id,
        precioCompra: a.costo,
        precioVenta: a.costo, // Se editará desde el panel
        stock: 0,
        stockMinimo: 1,
        unidadMedida: 'kg',
        esBolsaAlimento: true,
        kilosPorBolsa: a.kilos,
        margenSuelto: 42,
        esGenerico: false,
        activo: true,
      });

      stockMovements.push({
        producto: prod._id,
        tipo: 'entrada',
        cantidad: 0,
        stockAnterior: 0,
        stockNuevo: 0,
        motivo: 'Carga inicial catálogo',
        usuario: admin._id,
      });

      creados++;
    }

    if (stockMovements.length > 0) {
      await StockMovement.insertMany(stockMovements);
    }

    console.log(`\n🎉 Proceso terminado!`);
    console.log(`   ✅ Productos creados:  ${creados}`);
    console.log(`   ⚠️  Ya existían:        ${omitidos}`);
    console.log(`\n   ℹ️  El precioVenta fue fijado igual al costo.`);
    console.log(`      Actualizá el precio de venta desde la pantalla de Productos.`);
    console.log(`      El margenSuelto está en 42% para venta fraccionada.`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seedAlimentos();
