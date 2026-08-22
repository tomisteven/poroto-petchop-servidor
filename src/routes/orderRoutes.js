const express = require('express');
const router = express.Router();
const {
  createPublicOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  markAsRead,
  markWhatsappSent,
  getUnreadCount,
} = require('../controllers/orderController');
const { protect } = require('../middlewares/auth');

router.post('/public', createPublicOrder);
router.get('/unread-count', protect, getUnreadCount);
router.get('/', protect, getOrders);
router.get('/:id', protect, getOrder);
router.patch('/:id/estado', protect, updateOrderStatus);
router.patch('/:id/read', protect, markAsRead);
router.patch('/:id/whatsapp', protect, markWhatsappSent);

module.exports = router;
