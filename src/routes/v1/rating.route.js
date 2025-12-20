const express = require('express');
const auth = require('../../middlewares/auth');
const { ratingController } = require('../../controllers');

const router = express.Router();

// Get user ratings (current user)
router.get('/user', auth('user'), ratingController.getUserRatings);

// Get user ratings by user ID
router.get('/user/:userId', ratingController.getUserRatings);

// Update user metrics (force recalculation)
router.put('/user/update', auth('user'), ratingController.updateUserMetrics);

// Update user metrics by user ID (admin only)
router.put('/user/:userId/update', auth('admin'), ratingController.updateUserMetrics);

// Update gig metrics
router.put('/gig/:gigId/update', auth('user'), ratingController.updateGigMetrics);

module.exports = router;