const express = require('express');
const router = express.Router();
const {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  getAnnualReport,
  getTopProductsReport,
  getDashboardSummary,
  getGlobalStats,
  getSalesStats,
  getSalesHeatmap,
  getCashClose,
  getCashFlow,
  getDashboardExtra,
  getProductAnalysis,
  getLatestSales,
  getTaxes,
} = require('../controllers/reportController');
const { protect, admin } = require('../middlewares/auth');

router.get('/daily', protect, getDailyReport);
router.get('/weekly', protect, getWeeklyReport);
router.get('/monthly', protect, getMonthlyReport);
router.get('/annual', protect, getAnnualReport);
router.get('/top-products', protect, getTopProductsReport);
router.get('/summary', protect, getDashboardSummary);
router.get('/global-stats', protect, getGlobalStats);
router.get('/sales-stats', protect, getSalesStats);
router.get('/sales-heatmap', protect, getSalesHeatmap);
router.get('/cash-close', protect, getCashClose);
router.get('/cash-flow', protect, getCashFlow);
router.get('/dashboard-extra', protect, getDashboardExtra);
router.get('/product-analysis', protect, getProductAnalysis);
router.get('/latest-sales', protect, getLatestSales);
router.get('/taxes', protect, getTaxes);

module.exports = router;
