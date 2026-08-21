const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const User = require('../models/User');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Precio es VENTA AL PÚBLICO. precioCompra se deja en 0 para actualizar desde el panel.
const productosPorCategoria = [
  {
    categoria: { nombre: 'Shampoos', color: '#06b6d4', icono: 'droplets' },
    productos: [
      { nombre: 'Shampoo Elmer 250ml',          precioVenta: 6500 },
      { nombre: 'Dermosedan Avena Aloe 200g',    precioVenta: 8900 },
      { nombre: 'Dermosedan ClorHexidina',       precioVenta: 9800 },
      { nombre: 'Dermosedan Enjuague',           precioVenta: 8000 },
      { nombre: 'Formula MacDonald',             precioVenta: 18000 },
      { nombre: 'Osspret Jojoba',                precioVenta: 9700 },
      { nombre: 'Osspret Tradicional',           precioVenta: 9700 },
      { nombre: 'Osspret Double',                precioVenta: 9700 },
      { nombre: 'Osspret Aqua Ecto',             precioVenta: 9700 },
      { nombre: 'Osspret Belleza',               precioVenta: 9700 },
      { nombre: 'Osspret Cachorro',              precioVenta: 8800 },
      { nombre: 'Osspret Enjuague',              precioVenta: 10100 },
      { nombre: 'Osspret Gato Shampoo',          precioVenta: 9900 },
    ]
  },
  {
    categoria: { nombre: 'Pipetas', color: '#a855f7', icono: 'syringe' },
    productos: [
      { nombre: 'Osspret Pipeta Gato 4kg',       precioVenta: 3600 },
      { nombre: 'Osspret Pipeta Gato 8kg',       precioVenta: 4400 },
      { nombre: 'Osspret Pipeta Perro 10kg',     precioVenta: 3700 },
      { nombre: 'Osspret Pipeta Perro 20kg',     precioVenta: 4100 },
      { nombre: 'Osspret Pipeta Perro 40kg',     precioVenta: 4800 },
      { nombre: 'Osspret Pipeta Perro 60kg',     precioVenta: 5300 },
      { nombre: 'Hectopar',                      precioVenta: 3600 },
      { nombre: 'Power Pipeta 4kg',              precioVenta: 4600 },
      { nombre: 'Power Pipeta 10kg',             precioVenta: 4900 },
      { nombre: 'Power Pipeta 20kg',             precioVenta: 5800 },
      { nombre: 'Power Pipeta 40kg',             precioVenta: 7800 },
      { nombre: 'Power Pipeta 60kg',             precioVenta: 9500 },
      { nombre: 'FrontLine 10kg',                precioVenta: 8300 },
      { nombre: 'FrontLine 20kg',                precioVenta: 9200 },
      { nombre: 'FrontLine 40kg',                precioVenta: 11600 },
      { nombre: 'FrontLine 60kg',                precioVenta: 14300 },
      { nombre: 'FrontLine Spot On Gato',        precioVenta: 7800 },
      { nombre: 'FrontLine Plus Gato',           precioVenta: 11300 },
      { nombre: 'FrontLine Spray 100ml',         precioVenta: 29500 },
      { nombre: 'FrontLine Spray 250ml',         precioVenta: 45000 },
    ]
  },
  {
    categoria: { nombre: 'Antiparasitarios', color: '#ef4444', icono: 'shield' },
    productos: [
      { nombre: 'Vermican 20ml',                 precioVenta: 5500 },
      { nombre: 'Total Full CG 15ml',            precioVenta: 11000 },
      { nombre: 'Total Full LC Gatos',           precioVenta: 4600 },
      { nombre: 'Total Full LC Perro 10kg',      precioVenta: 3900 },
      { nombre: 'Total Full LC Perro 20kg',      precioVenta: 4600 },
      { nombre: 'Total Full LC Perro 60kg',      precioVenta: 7800 },
      { nombre: 'Meltra 4 a 8kg',                precioVenta: 9000 },
      { nombre: 'Feline 2 a 5kg',                precioVenta: 18000 },
      { nombre: 'Feline +5kg',                   precioVenta: 19800 },
    ]
  },
  {
    categoria: { nombre: 'Comprimidos', color: '#f59e0b', icono: 'pill' },
    productos: [
      { nombre: 'Nexgard 4kg',                   precioVenta: 23600 },
      { nombre: 'Nexgard 10kg',                  precioVenta: 25700 },
      { nombre: 'Nexgard 25kg',                  precioVenta: 33600 },
      { nombre: 'Nexgard 50kg',                  precioVenta: 39700 },
      { nombre: 'Power Comprimido hasta 5kg',    precioVenta: 8500 },
      { nombre: 'Power Comprimido hasta 10kg',   precioVenta: 9100 },
      { nombre: 'Power Comprimido hasta 20kg',   precioVenta: 10300 },
      { nombre: 'Power Comprimido hasta 30kg',   precioVenta: 12700 },
      { nombre: 'Power Comprimido hasta 40kg',   precioVenta: 14900 },
      { nombre: 'Simparica hasta 2.5kg',         precioVenta: 21800 },
      { nombre: 'Simparica hasta 5kg',           precioVenta: 23600 },
      { nombre: 'Simparica hasta 10kg',          precioVenta: 24000 },
      { nombre: 'Simparica hasta 20kg',          precioVenta: 31000 },
      { nombre: 'Simparica hasta 40kg',          precioVenta: 36300 },
      { nombre: 'Simparica hasta 60kg',          precioVenta: 43000 },
      { nombre: 'Bit Trio hasta 4.5kg',          precioVenta: 18800 },
      { nombre: 'Bit Trio hasta 10kg',           precioVenta: 20300 },
      { nombre: 'Bit Trio hasta 20kg',           precioVenta: 25600 },
      { nombre: 'Bit Trio hasta 40kg',           precioVenta: 29600 },
      { nombre: 'Fluravet +40kg',                precioVenta: 36500 },
    ]
  },
  {
    categoria: { nombre: 'Accesorios y Varios', color: '#10b981', icono: 'tag' },
    productos: [
      { nombre: 'Punta Orejas Elmer',            precioVenta: 5500 },
      { nombre: 'Sedagotas Lamar',               precioVenta: 5600 },
      { nombre: 'Otovier Limpia Orejas',         precioVenta: 6500 },
      { nombre: 'Desatanudos',                   precioVenta: 17000 },
      { nombre: 'Limpia Lágrimas',               precioVenta: 11800 },
      { nombre: 'Shulet Tropical',               precioVenta: 3500 },
      { nombre: 'Shulet Carassius 10g',          precioVenta: 3800 },
      { nombre: 'Shulet Carassius 20g',          precioVenta: 5600 },
      { nombre: 'Shulet Suelto 10g',             precioVenta: 2800 },
      { nombre: 'Flot Food',                     precioVenta: 2800 },
      { nombre: 'Azul de Metileno',              precioVenta: 3500 },
      { nombre: 'Espuma Seca',                   precioVenta: 10500 },
      { nombre: 'Condusin',                      precioVenta: 3600 },
      { nombre: 'Curabichera',                   precioVenta: 11500 },
      { nombre: 'Dental Plax',                   precioVenta: 6800 },
      { nombre: 'Pasta Dental',                  precioVenta: 9000 },
      { nombre: 'Osspret Filtro Solar',          precioVenta: 25100 },
      { nombre: 'Cepillo de Dientes Dedal',      precioVenta: 2600 },
      { nombre: 'Bolsita de Caca',               precioVenta: 1000 },
      { nombre: 'Neutralizador Zootec',          precioVenta: 6300 },
      { nombre: 'Perfumes',                      precioVenta: 11500, esGenerico: true },
      { nombre: 'Loción Desodorante',            precioVenta: 14500 },
      { nombre: 'Collar Ecthol',                 precioVenta: 16000 },
      { nombre: 'Paños Jabonosos',               precioVenta: 5600 },
      { nombre: 'Toallitas Húmedas',             precioVenta: 5800 },
    ]
  },
  {
    categoria: { nombre: 'Pouch / Húmedos', color: '#ec4899', icono: 'package' },
    productos: [
      { nombre: 'Whiskas Pouch',                 precioVenta: 1300 },
      { nombre: 'Pedigree Pouch',                precioVenta: 1300 },
      { nombre: 'Félix Pouch x1',               precioVenta: 2000 },
      { nombre: 'Félix Pouch x2',               precioVenta: 3600 },
      { nombre: 'Catchow Pouch x1',             precioVenta: 2200 },
      { nombre: 'Catchow Pouch x2',             precioVenta: 4000 },
    ]
  }
];

const seedOtrosProductos = async () => {
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

    for (const grupo of productosPorCategoria) {
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
        const existente = await Product.findOne({ nombre: { $regex: new RegExp(`^${p.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
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
          precioCompra: 0,         // sin dato de costo, se actualiza desde el panel
          precioVenta: p.precioVenta,
          stock: 0,
          stockMinimo: 1,
          unidadMedida: 'unidad',
          esBolsaAlimento: false,
          esGenerico: p.esGenerico || false,
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

        creadosEnCat++;
        totalCreados++;
      }

      if (stockMovements.length > 0) {
        await StockMovement.insertMany(stockMovements);
      }
      console.log(`  ✅ ${creadosEnCat} productos cargados\n`);
    }

    console.log('─────────────────────────────────────');
    console.log(`🎉 ¡Proceso finalizado!`);
    console.log(`   ✅ Productos creados:  ${totalCreados}`);
    console.log(`   ⚠️  Ya existían:        ${totalOmitidos}`);
    console.log(`\n   ℹ️  Costo (precioCompra) en 0 para todos.`);
    console.log(`      Actualizá los costos desde la pantalla de Productos.`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seedOtrosProductos();
