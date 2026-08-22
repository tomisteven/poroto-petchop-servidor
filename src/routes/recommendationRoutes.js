const express = require('express');
const router = express.Router();
const { recommendProducts, compareProducts, recommendWeb, generateDescription } = require('../controllers/recommendationController');
const { protect } = require('../middlewares/auth');

router.post('/compare', protect, compareProducts);
router.post('/web', protect, recommendWeb);
router.post('/generate-description', protect, generateDescription);
router.post('/', protect, recommendProducts);

module.exports = router;
