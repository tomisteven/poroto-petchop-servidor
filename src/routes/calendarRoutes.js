const express = require('express');
const router = express.Router();
const { getCalendarItems, getEvents, getEvent, createEvent, updateEvent, updateEventStatus, deleteEvent } = require('../controllers/calendarController');
const { protect } = require('../middlewares/auth');

router.get('/', protect, getCalendarItems);
router.get('/events', protect, getEvents);
router.get('/events/:id', protect, getEvent);
router.post('/events', protect, createEvent);
router.put('/events/:id', protect, updateEvent);
router.patch('/events/:id/estado', protect, updateEventStatus);
router.delete('/events/:id', protect, deleteEvent);

module.exports = router;