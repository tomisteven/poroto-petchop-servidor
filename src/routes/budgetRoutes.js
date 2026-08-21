const express = require('express');
const router = express.Router();
const { getBudgets, getBudget, createBudget, convertToSale, deleteBudget } = require('../controllers/budgetController');
const { protect } = require('../middlewares/auth');

router.get('/', protect, getBudgets);
router.get('/:id', protect, getBudget);
router.post('/', protect, createBudget);
router.patch('/:id/convertir', protect, convertToSale);
router.delete('/:id', protect, deleteBudget);

module.exports = router;
