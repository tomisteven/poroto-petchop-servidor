const express = require('express');
const router = express.Router();
const { getHistory, getHistoryItem, deleteHistoryItem, clearHistory } = require('../controllers/aiFeatureHistoryController');
const { protect } = require('../middlewares/auth');

router.get('/', protect, getHistory);
router.get('/:id', protect, getHistoryItem);
router.delete('/:id', protect, deleteHistoryItem);
router.delete('/', protect, clearHistory);

module.exports = router;
