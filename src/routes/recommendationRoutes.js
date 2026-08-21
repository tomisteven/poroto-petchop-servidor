const express = require('express');
const router = express.Router();
const { recommendProducts, compareProducts, recommendWeb } = require('../controllers/recommendationController');
const { protect } = require('../middlewares/auth');

router.post('/compare', protect, compareProducts);
router.post('/web', protect, recommendWeb);
router.post('/', protect, recommendProducts);

module.exports = router;