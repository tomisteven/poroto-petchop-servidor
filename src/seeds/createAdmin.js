const mongoose = require('mongoose');
const dns = require('dns');
const User = require('../models/User');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Forzar resolvers DNS públicos (evita error "querySrv ECONNREFUSED" con routers locales)
dns.setServers(['8.8.8.8', '1.1.1.1']);

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB Atlas');

    const existing = await User.findOne({ email: 'admin@mascotienda.com' });
    if (existing) {
      console.log('⚠️  El usuario admin ya existe. No se creó uno nuevo.');
      process.exit(0);
    }

    const admin = new User({
      nombre: 'Administrador',
      email: 'admin@mascotienda.com',
      password: 'admin123',
      rol: 'admin',
      activo: true
    });

    await admin.save();
    console.log('🎉 Usuario admin creado exitosamente!');
    console.log('   Email:    admin@mascotienda.com');
    console.log('   Password: admin123');
    console.log('   Rol:      admin');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createAdmin();
