const SystemConfig = require('../models/SystemConfig');
const LoyaltyConfig = require('../models/LoyaltyConfig');

const getSystemConfigDoc = async () => {
  let config = await SystemConfig.findOne({ singleton: 'config' });
  if (!config) {
    // Migración: si existía una config de afiliados (LoyaltyConfig), conservar su tasa de puntos
    let legacy = null;
    try {
      legacy = await LoyaltyConfig.findOne({ singleton: 'config' });
    } catch {
      legacy = null;
    }
    config = await SystemConfig.create({
      singleton: 'config',
      pesosPorPunto: legacy?.pesosPorPunto || 200,
    });
  }
  return config;
};

module.exports = { getSystemConfigDoc };