const Customer = require('../models/Customer');

const getCustomers = async (req, res) => {
  try {
    const { all } = req.query;
    const filter = all ? {} : { activo: true };
    const customers = await Customer.find(filter).sort({ nombre: 1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener clientes' });
  }
};

const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener cliente' });
  }
};

const createCustomer = async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear cliente' });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar cliente' });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar cliente' });
  }
};

module.exports = { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer };
