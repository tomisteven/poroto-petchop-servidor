const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts,
  bulkAction,
  getProductsWithoutMovement,
  getPublicCatalog,
} = require('../controllers/productController');
const { protect, admin } = require('../middlewares/auth');

router.route('/public/catalog')
  .get(getPublicCatalog);

router.route('/low-stock')
  .get(protect, getLowStockProducts);

router.route('/without-movement')
  .get(protect, getProductsWithoutMovement);

router.route('/bulk-action')
  .post(protect, admin, bulkAction);

router.route('/')
  .get(protect, getProducts)
  .post(protect, admin, createProduct);

router.route('/:id')
  .get(protect, getProductById)
  .put(protect, admin, updateProduct)
  .delete(protect, admin, deleteProduct);

router.route('/:id/stock')
  .patch(protect, adjustStock);

module.exports = router;
