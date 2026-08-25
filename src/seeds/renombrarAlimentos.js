require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Category = require('../models/Category');

const PREFIJOS_PERRO = ['PERRO', 'perro', 'Perro'];
const PREFIJOS_GATO = ['GATO', 'gato', 'Gato'];

const yaTienePrefijo = (nombre) => {
  return PREFIJOS_PERRO.some(p => nombre.startsWith(p + ' ')) || PREFIJOS_GATO.some(p => nombre.startsWith(p + ' '));
};

const esProductoGato = (nombre) => {
  const lower = nombre.toLowerCase();
  return lower.includes('gato') || lower.includes('cat') || lower.includes('kitten') || lower.includes('felino');
};

const esProductoPerro = (nombre) => {
  const lower = nombre.toLowerCase();
  return lower.includes('perro') || lower.includes('dog') || lower.includes('raza') || lower.includes('cachorro');
};

const run = async () => {
  await connectDB();

  const catsPerro = await Category.findOne({ nombre: 'Alimentos para Perros' });
  const catsGato = await Category.findOne({ nombre: 'Alimentos para Gatos' });
  const catsAlimentos = await Category.findOne({ nombre: 'Alimentos' });

  let actualizados = 0;

  if (catsPerro) {
    const productos = await Product.find({ categoria: catsPerro._id, activo: true });
    for (const p of productos) {
      if (yaTienePrefijo(p.nombre)) continue;
      const nuevo = 'PERRO ' + p.nombre;
      await Product.findByIdAndUpdate(p._id, { nombre: nuevo });
      console.log(`  [PERRO] ${p.nombre} → ${nuevo}`);
      actualizados++;
    }
  }

  if (catsGato) {
    const productos = await Product.find({ categoria: catsGato._id, activo: true });
    for (const p of productos) {
      if (yaTienePrefijo(p.nombre)) continue;
      const nuevo = 'GATO ' + p.nombre;
      await Product.findByIdAndUpdate(p._id, { nombre: nuevo });
      console.log(`  [GATO] ${p.nombre} → ${nuevo}`);
      actualizados++;
    }
  }

  if (catsAlimentos) {
    const productos = await Product.find({ categoria: catsAlimentos._id, activo: true });
    for (const p of productos) {
      if (yaTienePrefijo(p.nombre)) continue;
      if (esProductoGato(p.nombre)) {
        const nuevo = 'GATO ' + p.nombre;
        await Product.findByIdAndUpdate(p._id, { nombre: nuevo });
        console.log(`  [GATO] ${p.nombre} → ${nuevo}`);
        actualizados++;
      } else if (esProductoPerro(p.nombre)) {
        const nuevo = 'PERRO ' + p.nombre;
        await Product.findByIdAndUpdate(p._id, { nombre: nuevo });
        console.log(`  [PERRO] ${p.nombre} → ${nuevo}`);
        actualizados++;
      } else {
        console.log(`  [SIN CLASIFICAR] ${p.nombre} (categoría "Alimentos", no se detectó si es gato o perro)`);
      }
    }
  }

  console.log(`\nTotal productos actualizados: ${actualizados}`);
  mongoose.disconnect();
};

run();
