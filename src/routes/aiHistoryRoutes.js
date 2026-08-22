const express = require('express');
const router = express.Router();
const { getHistory, getHistoryItem, createHistory, deleteHistory } = require('../controllers/aiHistoryController');
const { protect } = require('../middlewares/auth');

router.get('/', protect, getHistory);
router.get('/:id', protect, getHistoryItem);
router.post('/', protect, createHistory);
router.delete('/:id', protect, deleteHistory);

module.exports = router;
