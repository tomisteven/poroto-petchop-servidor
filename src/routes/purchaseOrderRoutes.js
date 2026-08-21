const express = require('express');
const router = express.Router();
const { getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder } = require('../controllers/purchaseOrderController');
const { protect, admin } = require('../middlewares/auth');

router.get('/', protect, getPurchaseOrders);
router.get('/:id', protect, getPurchaseOrder);
router.post('/', protect, admin, createPurchaseOrder);
router.patch('/:id/recibir', protect, admin, receivePurchaseOrder);
router.patch('/:id/cancelar', protect, admin, cancelPurchaseOrder);

module.exports = router;
