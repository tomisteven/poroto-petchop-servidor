const mongoose = require('mongoose');
const dns = require('dns');
const Category = require('../models/Category');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const User = require('../models/User');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Forzar resolvers DNS públicos (evita error "querySrv ECONNREFUSED" con routers locales)
dns.setServers(['8.8.8.8', '1.1.1.1']);

// 10 alimentos balanceados reales del mercado argentino (perros y gatos)
const productosData = [
  // ================= PERROS =================
  {
    nombre: 'Pedigree Adulto Sabor Carne y Verduras',
    categoriaNombre: 'Alimentos para Perros',
    sku: 'PRB-001',
    descripcion:
      'Alimento balanceado completo para perros adultos de razas medianas y grandes. Sabor carne con verduras y cereales. Contiene proteínas de alta calidad para mantener los músculos fuertes, vitaminas y minerales esenciales, ácidos grasos Omega 6 y zinc para una piel y pelaje saludables. Presentación en bolsa de 21 kg. Ideal para perros de 1 a 7 años.',
    precioCompra: 65000,
    precioVenta: 89000,
    stock: 18,
    stockMinimo: 5,
    kilos: 21,
    proveedor: 'Distribuidora Pet Argentina',
  },
  {
    nombre: 'Dog Chow Adulto Carne, Pollo y Cereales',
    categoriaNombre: 'Alimentos para Perros',
    sku: 'PRB-002',
    descripcion:
      'Alimento balanceado para perros adultos de todas las razas. Sabor carne, pollo y cereales con un 21% de proteína y grasas seleccionadas que favorecen la digestión. Sistema de energía activa con vitaminas A, E y B para vitalidad diaria. Ayuda a un pelaje brillante con Omega 6. Bolsa de 20 kg. Recomendado para perros de 1 a 8 años.',
    precioCompra: 72000,
    precioVenta: 95000,
    stock: 24,
    stockMinimo: 6,
    kilos: 20,
    proveedor: 'Distribuidora Pet Argentina',
  },
  {
    nombre: 'Pro Plan Adulto Raza Mediana Carne',
    categoriaNombre: 'Alimentos para Perros',
    sku: 'PRB-003',
    descripcion:
      'Alimento premium superpremium para perros adultos de razas medianas (10-25 kg). Primer ingrediente pollo real. Fórmula con OptiDigest que favorece una digestión saludable, ácidos grasos Omega 3 y 6 para piel y pelaje brillantes, y antioxidantes para reforzar las defensas naturales. Sin colorantes ni conservantes artificiales. Bolsa de 15 kg.',
    precioCompra: 118000,
    precioVenta: 152000,
    stock: 3,
    stockMinimo: 4,
    kilos: 15,
    proveedor: 'Agro Pet Mayorista',
  },
  {
    nombre: 'Royal Canin Medium Adult',
    categoriaNombre: 'Alimentos para Perros',
    sku: 'PRB-004',
    descripcion:
      'Alimento superpremium específico para perros adultos de razas medianas (11-25 kg). Fórmula exclusiva con proteínas de alta digestibilidad (L.I.P.), fibras prebióticas para un equilibrio digestivo óptimo, y EPA-DHA para reforzar el sistema inmunológico. Granos adaptados al tamaño de la mandíbula. Ayuda a controlar el peso con un aporte calórico equilibrado. Bolsa de 15 kg.',
    precioCompra: 185000,
    precioVenta: 235000,
    stock: 10,
    stockMinimo: 3,
    kilos: 15,
    proveedor: 'Agro Pet Mayorista',
  },
  {
    nombre: 'Eukanuba Adulto Mantenimiento',
    categoriaNombre: 'Alimentos para Perros',
    sku: 'PRB-005',
    descripcion:
      'Alimento premium para perros adultos de todas las razas. Proteína animal de alta calidad (pollo) como primer ingrediente, con niveles de grasa animal para energía sostenida. Sistema Dental Defense con hexametafosfato de sodio que reduce la formación de sarro. Contiene glucosamina y condroitina para la salud de las articulaciones. Bolsa de 15 kg. Ideal para perros activos.',
    precioCompra: 92000,
    precioVenta: 120000,
    stock: 7,
    stockMinimo: 3,
    kilos: 15,
    proveedor: 'Distribuidora Pet Argentina',
  },

  // ================= GATOS =================
  {
    nombre: 'Whiskas Gato Adulto Sabor Carne',
    categoriaNombre: 'Alimentos para Gatos',
    sku: 'PRB-006',
    descripcion:
      'Alimento balanceado completo para gatos adultos (1 a 7 años). Sabor carne, con los nutrientes que tu gato necesita todos los días. Fórmula con proteína de alta calidad para músculos fuertes, fibra natural para ayudar a eliminar las bolas de pelo, taurina para el corazón y la vista, y Omega 6 para una piel sana. Bolsa de 20 kg. Ideal para gatos de interior y exterior.',
    precioCompra: 95000,
    precioVenta: 125000,
    stock: 0,
    stockMinimo: 5,
    kilos: 20,
    proveedor: 'Agro Pet Mayorista',
  },
  {
    nombre: 'Royal Canin Gato Esterilizado',
    categoriaNombre: 'Alimentos para Gatos',
    sku: 'PRB-007',
    descripcion:
      'Alimento superpremium para gatos esterilizados/castrados adultos (1-7 años). Fórmula específica que ayuda a mantener el peso ideal tras la castración reduciendo el aporte calórico y enriqueciéndose con L-carnitina para quemar grasa. Proteínas de alta digestibilidad (L.I.P.) y fibras para un tránsito digestivo saludable. Aporta calcio para el sistema urinario y ayuda a disolver cálculos de estruvita. Bolsa de 10 kg.',
    precioCompra: 132000,
    precioVenta: 168000,
    stock: 4,
    stockMinimo: 3,
    kilos: 10,
    proveedor: 'Agro Pet Mayorista',
  },
  {
    nombre: 'Pro Plan Gato Adulto Sabor Pescado',
    categoriaNombre: 'Alimentos para Gatos',
    sku: 'PRB-008',
    descripcion:
      'Alimento superpremium para gatos adultos. Sabor pescado (salmon) con fórmula Optidigest que garantiza una digestión saludable y una mejor absorción de nutrientes. Contiene taurina esencial para el corazón y la visión, y proteínas de alta calidad para mantener la masa muscular. Croquetas con forma especial que ayudan a la higiene dental. Bolsa de 10 kg.',
    precioCompra: 98000,
    precioVenta: 128000,
    stock: 12,
    stockMinimo: 4,
    kilos: 10,
    proveedor: 'Agro Pet Mayorista',
  },
  {
    nombre: 'Cat Chow Adulto Sabor Carne',
    categoriaNombre: 'Alimentos para Gatos',
    sku: 'PRB-009',
    descripcion:
      'Alimento balanceado completo para gatos adultos (1 a 7 años). Sabor carne, formulado con proteínas de alta calidad para una digestión sana. Sistema de control de bolas de pelo con fibra natural, y nutrientes esenciales como taurina, vitaminas A y E para una visión, corazón e inmunidad fuertes. Croqueta crujiente que ayuda a reducir la placa dental. Bolsa de 15 kg.',
    precioCompra: 88000,
    precioVenta: 115000,
    stock: 2,
    stockMinimo: 5,
    kilos: 15,
    proveedor: 'Distribuidora Pet Argentina',
  },
  {
    nombre: 'Excellent Gato Adulto Pollo y Arroz',
    categoriaNombre: 'Alimentos para Gatos',
    sku: 'PRB-010',
    descripcion:
      'Alimento premium para gatos adultos. Sabor pollo y arroz, sin colorantes ni saborizantes artificiales. Fórmula con proteína de alta calidad para músculos fuertes, taurina para la salud cardiaca y visual, y mezcla de fibras solubles e insolubles que ayuda a prevenir la formación de bolas de pelo. Mantiene la piel y el pelaje sanos gracias al Omega 6. Bolsa de 15 kg.',
    precioCompra: 70000,
    precioVenta: 92000,
    stock: 20,
    stockMinimo: 6,
    kilos: 15,
    proveedor: 'Distribuidora Pet Argentina',
  },
];

const seedProductosPrueba = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB Atlas');

    const admin = await User.findOne({ rol: 'admin' });
    if (!admin) {
      throw new Error('No se encontró un usuario admin. Ejecutá createAdmin.js primero.');
    }

    let creados = 0;
    let omitidos = 0;
    const stockMovements = [];

    for (const p of productosData) {
      // Categoría (buscar o crear)
      let categoria = await Category.findOne({ nombre: p.categoriaNombre });
      if (!categoria) {
        const color = p.categoriaNombre.includes('Gatos') ? '#a855f7' : '#f97316';
        categoria = await Category.create({ nombre: p.categoriaNombre, color, icono: 'package' });
        console.log(`  📦 Categoría creada: ${p.categoriaNombre}`);
      }

      // Saltear si ya existe el producto por nombre o SKU
      const existente = await Product.findOne({ $or: [{ sku: p.sku }, { nombre: p.nombre }] });
      if (existente) {
        console.log(`  ⚠️  Ya existe: ${p.nombre} (omitido)`);
        omitidos++;
        continue;
      }

      const prod = await Product.create({
        nombre: p.nombre,
        descripcion: p.descripcion,
        sku: p.sku,
        categoria: categoria._id,
        precioCompra: p.precioCompra,
        precioVenta: p.precioVenta,
        stock: p.stock,
        stockMinimo: p.stockMinimo,
        unidadMedida: 'kg',
        proveedor: p.proveedor,
        esBolsaAlimento: true,
        kilosPorBolsa: p.kilos,
        margenSuelto: 42,
        esGenerico: false,
        activo: true,
      });

      stockMovements.push({
        producto: prod._id,
        tipo: 'entrada',
        cantidad: p.stock,
        stockAnterior: 0,
        stockNuevo: p.stock,
        motivo: 'Carga inicial catálogo (pruebas)',
        usuario: admin._id,
      });

      creados++;
      console.log(`  ✅ Creado: ${p.nombre} (${p.sku}) — $${p.precioVenta}`);
    }

    if (stockMovements.length > 0) {
      await StockMovement.insertMany(stockMovements);
    }

    console.log(`\n🎉 Proceso terminado!`);
    console.log(`   ✅ Productos creados: ${creados}`);
    console.log(`   ⚠️  Ya existían: ${omitidos}`);
    console.log(`   📦 Incluye categorías: "Alimentos para Perros" y "Alimentos para Gatos"`);
    console.log(`   ℹ️  Productos con stock bajo a propósito (para probar alertas): Pro Plan, Cat Chow, Royal Canin Esterilizado`);
    console.log(`   ℹ️  Whiskas Gato está con stock 0 (para probar agotados).`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seedProductosPrueba();