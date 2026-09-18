const { getSystemConfigDoc } = require('../utils/systemConfig');

const serialize = (cfg) => ({
  metaFacturacionDiaria: cfg.metaFacturacionDiaria,
  metaGananciaDiaria: cfg.metaGananciaDiaria,
  metaFacturacionMensual: cfg.metaFacturacionMensual,
  margenSueltoDefecto: cfg.margenSueltoDefecto,
  pesosPorPunto: cfg.pesosPorPunto,
});

const getConfig = async (req, res) => {
  try {
    const config = await getSystemConfigDoc();
    res.json({ config: serialize(config) });
  } catch (error) {
    console.error('Error getSystemConfig:', error);
    res.status(500).json({ message: 'Error al obtener la configuración' });
  }
};

const updateConfig = async (req, res) => {
  try {
    const config = await getSystemConfigDoc();
    const allowed = ['metaFacturacionDiaria', 'metaGananciaDiaria', 'metaFacturacionMensual', 'margenSueltoDefecto', 'pesosPorPunto'];
    let changed = false;

    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      const val = Number(req.body[key]);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ message: `${key} debe ser un número válido y mayor o igual a 0` });
      }
      config[key] = val;
      changed = true;
    }

    if (!changed) {
      return res.status(400).json({ message: 'No hay campos para actualizar' });
    }

    await config.save();
    res.json({ message: 'Configuración actualizada', config: serialize(config) });
  } catch (error) {
    console.error('Error updateSystemConfig:', error);
    res.status(500).json({ message: 'Error al actualizar la configuración' });
  }
};

module.exports = { getConfig, updateConfig };