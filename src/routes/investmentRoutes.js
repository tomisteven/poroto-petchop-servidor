const express = require('express');
const router = express.Router();
const { getInvestments, getInvestment, createInvestment, updateInvestment, updateInvestmentStatus, deleteInvestment } = require('../controllers/investmentController');
const { protect, admin } = require('../middlewares/auth');

router.get('/', protect, getInvestments);
router.get('/:id', protect, getInvestment);
router.post('/', protect, admin, createInvestment);
router.put('/:id', protect, admin, updateInvestment);
router.patch('/:id/estado', protect, admin, updateInvestmentStatus);
router.delete('/:id', protect, admin, deleteInvestment);

module.exports = router;
