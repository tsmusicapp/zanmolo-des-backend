const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const { getAllContactUs } = require('../../controllers/contactUs.controller');
const ContactUs = require('../../models/contactUs.model');
const DailyLimits = require('../../models/dailyLimits.model');

// GET /v1/contact-us (admin only)
router.get('/', auth(), getAllContactUs);

// POST /v1/contact-us
router.post('/', async (req, res) => {
  const { email, type, description } = req.body;
  if (!email || !type || !description) {
    return res.status(400).json({ message: 'email, type, and description are required.' });
  }

  try {
    // Check daily contact us limit for both authenticated and anonymous users
    const userId = req.user && req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    if (userId) {
      // For authenticated users, use userId
      const dailyLimits = await DailyLimits.getOrCreateDailyLimits(userId);
      
      if (!dailyLimits.canPerformAction('contactUs')) {
        const remaining = dailyLimits.getRemainingActions('contactUs');
        return res.status(429).json({ 
          success: false, 
          message: `Daily contact us limit reached. You can send ${remaining} more messages today.`,
          limitReached: true,
          remaining: remaining
        });
      }
      
      // Save to DB
      const contact = await ContactUs.create({ email, type, description });
      
      // Increment contact us count
      await dailyLimits.incrementAction('contactUs');
      
      return res.status(201).json({ message: 'Contact request received', data: contact });
    } else {
      // For anonymous users, use a simpler approach
      try {
        // Count existing contact us messages for this email today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        
        const existingCount = await ContactUs.countDocuments({
          email: email,
          createdAt: {
            $gte: todayStart,
            $lte: todayEnd
          }
        });
        
        if (existingCount >= 5) {
          return res.status(429).json({ 
            success: false, 
            message: `Daily contact us limit reached for this email. You can send ${5 - existingCount} more messages today.`,
            limitReached: true,
            remaining: Math.max(0, 5 - existingCount)
          });
        }
        
        // Save to DB
        const contact = await ContactUs.create({ email, type, description });
        return res.status(201).json({ message: 'Contact request received', data: contact });
        
      } catch (error) {
        console.error('Error checking email limits:', error);
        
        // If there's an error, still allow the contact to be sent
        const contact = await ContactUs.create({ email, type, description });
        return res.status(201).json({ message: 'Contact request received', data: contact });
      }
    }
  } catch (error) {
    console.error('Contact us error:', error);
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(500).json({ 
        message: 'A duplicate request was detected. Please try again in a moment.',
        error: 'Duplicate key error'
      });
    }
    
    return res.status(500).json({ 
      message: 'Failed to send contact request. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
