const Supplier = require('../models/Supplier');

const getSuppliers = async (req, res) => {
  try {
    const { all } = req.query;
    const filter = all ? {} : { activo: true };
    const suppliers = await Supplier.find(filter).sort({ nombre: 1 });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener proveedores' });
  }
};

const getSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener proveedor' });
  }
};

const createSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.create(req.body);
    res.status(201).json(supplier);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear proveedor' });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar proveedor' });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });
    res.json({ message: 'Proveedor eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar proveedor' });
  }
};

module.exports = { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier };
