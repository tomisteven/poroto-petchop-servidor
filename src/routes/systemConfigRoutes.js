const express = require('express');
const router = express.Router();
const { getConfig, updateConfig } = require('../controllers/systemConfigController');
const { protect, admin } = require('../middlewares/auth');

router.route('/')
  .get(protect, getConfig)
  .put(protect, admin, updateConfig);

module.exports = router;