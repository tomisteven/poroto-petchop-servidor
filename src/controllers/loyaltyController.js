const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const LoyaltyReward = require('../models/LoyaltyReward');
const Redemption = require('../models/Redemption');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { getConfigDoc } = require('../utils/loyalty');

const inicioMesArg = () => {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return new Date(`${y}-${m}-01T03:00:00.000Z`);
};

const getConfig = async (req, res) => {
  try {
    res.json(await getConfigDoc());
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la configuración' });
  }
};

const updateConfig = async (req, res) => {
  try {
    const { pesosPorPunto } = req.body;
    if (!pesosPorPunto || pesosPorPunto <= 0) {
      return res.status(400).json({ message: 'Ingresá un valor válido de pesos por punto' });
    }
    const config = await getConfigDoc();
    config.pesosPorPunto = pesosPorPunto;
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar la configuración' });
  }
};

const getRewards = async (req, res) => {
  try {
    const rewards = await LoyaltyReward.find().populate('producto', 'nombre sku').sort({ puntosRequeridos: 1 });
    res.json(rewards);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener recompensas' });
  }
};

const createReward = async (req, res) => {
  try {
    const { nombre, descripcion, tipo, valor, producto, puntosRequeridos } = req.body;
    if (!nombre || !tipo || !puntosRequeridos) {
      return res.status(400).json({ message: 'Nombre, tipo y puntos requeridos son obligatorios' });
    }
    const reward = await LoyaltyReward.create({
      nombre, descripcion, tipo, valor, producto, puntosRequeridos
    });
    res.status(201).json(reward);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear recompensa' });
  }
};

const updateReward = async (req, res) => {
  try {
    const reward = await LoyaltyReward.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!reward) return res.status(404).json({ message: 'Recompensa no encontrada' });
    res.json(reward);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar recompensa' });
  }
};

const deleteReward = async (req, res) => {
  try {
    const reward = await LoyaltyReward.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });
    if (!reward) return res.status(404).json({ message: 'Recompensa no encontrada' });
    res.json({ message: 'Recompensa desactivada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar recompensa' });
  }
};

const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({ activo: true }).sort({ nombre: 1 });
    const ids = customers.map(c => c._id);

    const [totalAgg, mesAgg] = await Promise.all([
      Sale.aggregate([
        { $match: { cliente: { $in: ids }, estado: 'completada' } },
        { $group: { _id: '$cliente', total: { $sum: '$totalFinal' }, ventas: { $sum: 1 }, puntos: { $sum: '$puntosGanados' } } }
      ]),
      Sale.aggregate([
        { $match: { cliente: { $in: ids }, estado: 'completada', fecha: { $gte: inicioMesArg() } } },
        { $group: { _id: '$cliente', gastoMes: { $sum: '$totalFinal' }, ventasMes: { $sum: 1 } } }
      ])
    ]);

    const totalMap = new Map(totalAgg.map(a => [String(a._id), a]));
    const mesMap = new Map(mesAgg.map(a => [String(a._id), a]));

    const result = customers.map(c => {
      const t = totalMap.get(String(c._id)) || {};
      const m = mesMap.get(String(c._id)) || {};
      return {
        _id: c._id,
        nombre: c.nombre,
        telefono: c.telefono,
        email: c.email,
        direccion: c.direccion,
        esAfiliado: c.esAfiliado,
        puntos: c.puntos,
        fechaAfiliacion: c.fechaAfiliacion,
        activo: c.activo,
        totalGastado: t.total || 0,
        ventas: t.ventas || 0,
        puntosGanados: t.puntos || 0,
        gastoMes: m.gastoMes || 0,
        ventasMes: m.ventasMes || 0
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener clientes' });
  }
};

const getCustomerDetail = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });

    const [ventas, canjes] = await Promise.all([
      Sale.find({ cliente: customer._id, estado: 'completada' })
        .populate('empleado', 'nombre')
        .populate('items.producto', 'nombre sku')
        .sort({ fecha: -1 }),
      Redemption.find({ cliente: customer._id })
        .populate('recompensa', 'nombre tipo')
        .populate('empleado', 'nombre')
        .sort({ fecha: -1 })
    ]);

    const mesAgg = await Sale.aggregate([
      { $match: { cliente: customer._id, estado: 'completada', fecha: { $gte: inicioMesArg() } } },
      { $group: { _id: null, gastoMes: { $sum: '$totalFinal' }, ventasMes: { $sum: 1 } } }
    ]);

    res.json({
      cliente: customer,
      ventas,
      canjes,
      gastoMes: mesAgg[0]?.gastoMes || 0,
      ventasMes: mesAgg[0]?.ventasMes || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el cliente' });
  }
};

const afiliarCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    customer.esAfiliado = true;
    customer.fechaAfiliacion = customer.fechaAfiliacion || new Date();
    await customer.save();
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error al afiliar cliente' });
  }
};

const redeem = async (req, res) => {
  try {
    const { clienteId, recompensaId, notas } = req.body;
    const [cliente, recompensa] = await Promise.all([
      Customer.findById(clienteId),
      LoyaltyReward.findById(recompensaId)
    ]);

    if (!cliente) return res.status(404).json({ message: 'Cliente no encontrado' });
    if (!recompensa || !recompensa.activo) return res.status(404).json({ message: 'Recompensa no encontrada' });
    if (!cliente.esAfiliado) return res.status(400).json({ message: 'El cliente no está afiliado' });
    if (cliente.puntos < recompensa.puntosRequeridos) {
      return res.status(400).json({ message: 'Puntos insuficientes' });
    }

    cliente.puntos -= recompensa.puntosRequeridos;
    await cliente.save();

    const redemption = await Redemption.create({
      cliente: cliente._id,
      recompensa: recompensa._id,
      puntosUsados: recompensa.puntosRequeridos,
      empleado: req.user._id,
      notas
    });

    if (recompensa.tipo === 'producto' && recompensa.producto) {
      const prod = await Product.findById(recompensa.producto);
      if (prod && prod.stock >= 1) {
        await Product.findByIdAndUpdate(prod._id, { $inc: { stock: -1 } });
        await StockMovement.create({
          producto: prod._id,
          tipo: 'salida',
          cantidad: 1,
          stockAnterior: prod.stock,
          stockNuevo: prod.stock - 1,
          motivo: 'Canje de recompensa',
          usuario: req.user._id
        });
      }
    }

    res.status(201).json(redemption);
  } catch (error) {
    res.status(500).json({ message: 'Error al canjear recompensa' });
  }
};

const getRedemptions = async (req, res) => {
  try {
    const { clienteId } = req.query;
    const filter = clienteId ? { cliente: clienteId } : {};
    const redemptions = await Redemption.find(filter)
      .populate('cliente', 'nombre')
      .populate('recompensa', 'nombre tipo')
      .populate('empleado', 'nombre')
      .sort({ fecha: -1 });
    res.json(redemptions);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener canjes' });
  }
};

module.exports = { getConfig, updateConfig, getRewards, createReward, updateReward, deleteReward, getCustomers, getCustomerDetail, afiliarCustomer, redeem, getRedemptions };