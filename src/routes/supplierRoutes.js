const express = require('express');
const router = express.Router();
const { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier } = require('../controllers/supplierController');
const { protect, admin } = require('../middlewares/auth');

router.get('/', protect, getSuppliers);
router.get('/:id', protect, getSupplier);
router.post('/', protect, admin, createSupplier);
router.put('/:id', protect, admin, updateSupplier);
router.delete('/:id', protect, admin, deleteSupplier);

module.exports = router;
