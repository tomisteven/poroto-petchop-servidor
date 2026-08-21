const express = require('express');
const router = express.Router();
const { getConfig, updateConfig, getRewards, createReward, updateReward, deleteReward, getCustomers, getCustomerDetail, afiliarCustomer, redeem, getRedemptions } = require('../controllers/loyaltyController');
const { protect, admin } = require('../middlewares/auth');

router.get('/config', protect, getConfig);
router.put('/config', protect, admin, updateConfig);

router.get('/rewards', protect, getRewards);
router.post('/rewards', protect, admin, createReward);
router.put('/rewards/:id', protect, admin, updateReward);
router.delete('/rewards/:id', protect, admin, deleteReward);

router.get('/customers', protect, getCustomers);
router.get('/customers/:id', protect, getCustomerDetail);
router.patch('/customers/:id/afiliar', protect, afiliarCustomer);

router.get('/redemptions', protect, getRedemptions);
router.post('/redeem', protect, redeem);

module.exports = router;