const express = require('express');
const router = express.Router();
const {
  getFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  getMonthStatus,
  markPaid,
  markUnpaid,
} = require('../controllers/fixedExpenseController');
const { protect, admin } = require('../middlewares/auth');

router.get('/status', protect, getMonthStatus);
router.get('/', protect, getFixedExpenses);
router.post('/', protect, admin, createFixedExpense);
router.put('/:id', protect, admin, updateFixedExpense);
router.delete('/:id', protect, admin, deleteFixedExpense);
router.post('/:id/pay', protect, admin, markPaid);
router.delete('/:id/pay', protect, admin, markUnpaid);

module.exports = router;