const express = require('express');
const router = express.Router();
const { getSales, getSaleById, createSale, cancelSale, setSaleCustomer, updateSale } = require('../controllers/saleController');
const { protect, admin } = require('../middlewares/auth');

router.route('/')
  .get(protect, getSales)
  .post(protect, createSale);

router.route('/:id')
  .get(protect, getSaleById)
  .patch(protect, admin, updateSale);

router.route('/:id/cliente')
  .patch(protect, setSaleCustomer);

router.route('/:id/anular')
  .patch(protect, admin, cancelSale);

module.exports = router;
