const { getSystemConfigDoc } = require('./systemConfig');

const getConfigDoc = async () => getSystemConfigDoc();

const calcularPuntos = async (total) => {
  const config = await getSystemConfigDoc();
  return Math.floor((total || 0) / config.pesosPorPunto);
};

module.exports = { getConfigDoc, calcularPuntos };