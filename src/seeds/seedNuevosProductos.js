const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const User = require('../models/User');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const nuevosProductosPorCategoria = [
  {
    categoria: { nombre: 'Pouch / Húmedos', color: '#ec4899', icono: 'package' },
    productos: [
      { nombre: 'Wiscas (Whiskas) Pouch', precioVenta: 1300 },
      { nombre: 'Pedigree Pouch', precioVenta: 1300 },
      { nombre: 'Félix Pouch x1', precioVenta: 2000 },
      { nombre: 'Félix Pouch x2', precioVenta: 3600 },
      { nombre: 'Cat chow x1 Pouch', precioVenta: 2200 },
      { nombre: 'Cat chow x2 Pouch', precioVenta: 4000 },
      { nombre: 'Natu fresh x1 Pouch', precioVenta: 1500 },
      { nombre: 'Natu fresh x2 Pouch', precioVenta: 2500 },
      { nombre: 'Optimum Pouch', precioVenta: 1800 },
      { nombre: 'Lata pedigree', precioVenta: 3700 },
      { nombre: 'Recovery Royal Canin 195 grs', precioVenta: 8300 },
      { nombre: 'Recovery Sieger lata 340 grs', precioVenta: 8300 },
      { nombre: 'Recovery Sieger Pouch', precioVenta: 4300 },
      { nombre: 'Agility latas 340 grs', precioVenta: 6300 },
      { nombre: 'Royal Canin pouch Dachshund 85 grs', precioVenta: 2900 },
      { nombre: 'Royal Canin pouch mini puppy 85 grs', precioVenta: 2400 },
      { nombre: 'Royal Canin pouch kitten 85 grs', precioVenta: 3400 },
    ]
  },
  {
    categoria: { nombre: 'Piedras e Higiene', color: '#64748b', icono: 'trash-2' },
    productos: [
      { nombre: 'Piedras sueltas 1 kg', precioVenta: 1100 },
      { nombre: 'Piedras sueltas 3 kg', precioVenta: 3000 },
      { nombre: 'Sequitos 25 kg', precioVenta: 19000 },
      { nombre: 'Piedras aroma lavanda 1 kg', precioVenta: 2000 },
      { nombre: 'Piedras aroma lavanda 3 kg', precioVenta: 5600 },
      { nombre: 'Piedras aroma lavanda 15 kg', precioVenta: 22500 },
      { nombre: 'Bedywood 1 kg', precioVenta: 1100 },
      { nombre: 'Bedywood 3 kg', precioVenta: 3000 },
      { nombre: 'Arena zootec 4 kg', precioVenta: 7500 },
      { nombre: 'Arena zootec 15 kg', precioVenta: 22500 },
      { nombre: 'Absorsol 3.6 kg', precioVenta: 4900 },
      { nombre: 'Piedras citricas 10 kg', precioVenta: 14300 },
      { nombre: 'Fresh cat 10 kg', precioVenta: 9600 },
      { nombre: 'Viruta', precioVenta: 2700 },
    ]
  },
  {
    categoria: { nombre: 'Snacks / Premios', color: '#f97316', icono: 'cookie' },
    productos: [
      { nombre: 'Rabos de cerdo x1', precioVenta: 850 },
      { nombre: 'Rabos de cerdo x3', precioVenta: 2100 },
      { nombre: 'Grisines grandes x1', precioVenta: 1500 },
      { nombre: 'Grisines grandes x3', precioVenta: 4000 },
      { nombre: 'Centro de oreja x1', precioVenta: 600 },
      { nombre: 'Centro de oreja x4', precioVenta: 2000 },
      { nombre: 'Orejas', precioVenta: 1400 },
      { nombre: 'Huesos 3/4', precioVenta: 1400 },
      { nombre: 'Huesos 5/6', precioVenta: 2800 },
      { nombre: 'Huesos 7/8', precioVenta: 4200 },
      { nombre: 'Huesos 10/11', precioVenta: 8500 },
      { nombre: 'Palitos', precioVenta: 500 },
      { nombre: 'Golocan sueltas x1', precioVenta: 1100 },
      { nombre: 'Golocan sueltas x2', precioVenta: 2000 },
      { nombre: 'Garritas x1', precioVenta: 1000 },
      { nombre: 'Garritas x5', precioVenta: 4500 },
      { nombre: 'Golomiau', precioVenta: 2300 },
      { nombre: 'Golocan palitos de pollo', precioVenta: 2000 },
      { nombre: 'Raza bocaditos', precioVenta: 1300 },
      { nombre: 'Tiernitos snack', precioVenta: 2200 },
      { nombre: 'Cornalitos', precioVenta: 4200 },
      { nombre: 'Pepas', precioVenta: 3000 },
      { nombre: 'Moisty cream', precioVenta: 2800 },
      { nombre: 'Raza guisado', precioVenta: 3200 },
      { nombre: 'Cookies zootec', precioVenta: 3800 },
      { nombre: 'Ruedita de sal zootec', precioVenta: 3950 },
      { nombre: 'Stick zootec', precioVenta: 3800 },
      { nombre: 'Nectar colibri', precioVenta: 3900 },
      { nombre: 'Dentastix', precioVenta: 1400 },
      { nombre: 'Dentastix mediano', precioVenta: 2000 },
      { nombre: 'Dentastix grande', precioVenta: 3300 },
      { nombre: 'Whiskas snacks', precioVenta: 2300 },
      { nombre: 'Palitos x200', precioVenta: 12900 },
      { nombre: 'Heno zootec', precioVenta: 5000 },
      { nombre: 'Alfalfa zootec', precioVenta: 5000 },
      { nombre: 'Baño de arena zootec', precioVenta: 5500 },
    ]
  },
  {
    categoria: { nombre: 'Cuchas y Camas', color: '#78350f', icono: 'home' },
    productos: [
      { nombre: 'Cama King side', precioVenta: 37000 },
      { nombre: 'Moises 40 cm', precioVenta: 12800 },
      { nombre: 'Moises 60 cm', precioVenta: 20000 },
      { nombre: 'Moises antidesgarro', precioVenta: 30800 },
      { nombre: 'Moises cuna', precioVenta: 28000 },
      { nombre: 'Cueva polar 50 cm', precioVenta: 25000 },
      { nombre: 'Cueva polar 70 cm', precioVenta: 29500 },
      { nombre: 'Nido 50 cm', precioVenta: 10500 },
      { nombre: 'Nido 70 cm', precioVenta: 16500 },
      { nombre: 'Colchon 75x100 cm', precioVenta: 26600 },
      { nombre: 'Colchon antidesgarro 75x100 cm', precioVenta: 38900 },
      { nombre: 'Cubo gato', precioVenta: 20000 },
    ]
  },
  {
    categoria: { nombre: 'Transportadoras', color: '#1e3a8a', icono: 'truck' },
    productos: [
      { nombre: 'Transportadora Economica chica', precioVenta: 15500 },
      { nombre: 'Transportadora Grande negra', precioVenta: 29500 },
      { nombre: 'Transportadora Animal print', precioVenta: 30000 },
      { nombre: 'Transportadora Plastico grande', precioVenta: 45000 },
    ]
  }
];

const seedNuevosProductos = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB Atlas\n');

    const admin = await User.findOne({ rol: 'admin' });
    if (!admin) throw new Error('No se encontró usuario admin. Ejecutá createAdmin.js primero.');

    let totalCreados = 0;
    let totalOmitidos = 0;
    let skuCounter = 1;

    // Obtener el mayor SKU numérico existente del prefijo OTR para no repetir
    const lastProd = await Product.findOne({ sku: /^OTR-/ }).sort({ sku: -1 });
    if (lastProd) {
      const num = parseInt(lastProd.sku.replace('OTR-', ''), 10);
      if (!isNaN(num)) skuCounter = num + 1;
    }

    for (const grupo of nuevosProductosPorCategoria) {
      // Buscar o crear categoría
      let cat = await Category.findOne({ nombre: grupo.categoria.nombre });
      if (!cat) {
        cat = await Category.create(grupo.categoria);
        console.log(`📦 Categoría creada: ${cat.nombre}`);
      } else {
        console.log(`📦 Categoría existente: ${cat.nombre}`);
      }

      const stockMovements = [];
      let creadosEnCat = 0;

      for (const p of grupo.productos) {
        // Normalizar nombre para búsqueda (ignorar mayúsculas y espacios extras)
        const existente = await Product.findOne({
          nombre: { $regex: new RegExp(`^${p.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });

        if (existente) {
          console.log(`  ⚠️  Ya existe: ${p.nombre}`);
          totalOmitidos++;
          continue;
        }

        const sku = `OTR-${String(skuCounter).padStart(3, '0')}`;
        skuCounter++;

        const prod = await Product.create({
          nombre: p.nombre,
          sku,
          categoria: cat._id,
          precioCompra: 0,
          precioVenta: p.precioVenta,
          stock: 0,
          stockMinimo: 1,
          unidadMedida: 'unidad',
          esBolsaAlimento: false,
          esGenerico: false,
          activo: true,
        });

        stockMovements.push({
          producto: prod._id,
          tipo: 'entrada',
          cantidad: 0,
          stockAnterior: 0,
          stockNuevo: 0,
          motivo: 'Carga inicial productos solicitados',
          usuario: admin._id,
        });

        creadosEnCat++;
        totalCreados++;
      }

      if (stockMovements.length > 0) {
        await StockMovement.insertMany(stockMovements);
      }
      console.log(`  ✅ ${creadosEnCat} productos cargados en ${cat.nombre}\n`);
    }

    console.log('─────────────────────────────────────');
    console.log(`🎉 ¡Proceso finalizado!`);
    console.log(`   ✅ Productos creados:  ${totalCreados}`);
    console.log(`   ⚠️  Ya existían:        ${totalOmitidos}`);
    console.log(`\n   ℹ️  Costo en 0 y Stock en 0.`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seedNuevosProductos();
