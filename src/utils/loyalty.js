const LoyaltyConfig = require('../models/LoyaltyConfig');

const getConfigDoc = async () => {
  let config = await LoyaltyConfig.findOne({ singleton: 'config' });
  if (!config) config = await LoyaltyConfig.create({ singleton: 'config' });
  return config;
};

const calcularPuntos = async (total) => {
  const config = await getConfigDoc();
  return Math.floor((total || 0) / config.pesosPorPunto);
};

module.exports = { getConfigDoc, calcularPuntos };