const express = require('express');
const router = express.Router();
const { getExpenses, getExpense, createExpense, updateExpense, deleteExpense } = require('../controllers/expenseController');
const { protect, admin } = require('../middlewares/auth');

router.get('/', protect, getExpenses);
router.get('/:id', protect, getExpense);
router.post('/', protect, admin, createExpense);
router.put('/:id', protect, admin, updateExpense);
router.delete('/:id', protect, admin, deleteExpense);

module.exports = router;
