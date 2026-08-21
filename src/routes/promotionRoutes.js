const express = require('express');
const router = express.Router();
const {
  getPromotions,
  getPromotion,
  generateWithAI,
  createPromotion,
  updatePromotion,
  toggleEstado,
  deletePromotion,
} = require('../controllers/promotionController');
const { protect, admin } = require('../middlewares/auth');

router.get('/', protect, getPromotions);
router.get('/:id', protect, getPromotion);
router.post('/generar', protect, admin, generateWithAI);
router.post('/', protect, admin, createPromotion);
router.put('/:id', protect, admin, updatePromotion);
router.patch('/:id/estado', protect, admin, toggleEstado);
router.delete('/:id', protect, admin, deletePromotion);

module.exports = router;