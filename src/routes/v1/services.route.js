const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const servicesController = require('../../controllers/services.controller');
const { uploadChatAttachment } = require('../../middlewares/upload');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for creation endpoints
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many service creation attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development',
});

// Service creation with deliverables
router.route('/create')
  .post(auth(), createLimiter, servicesController.createServiceWithDeliverables);

// Get deliverable templates by category
router.route('/deliverables/templates/:category')
  .get(servicesController.getDeliverableTemplates);

// Update service deliverables
router.route('/:serviceId/deliverables')
  .put(auth(), servicesController.updateServiceDeliverables);

module.exports = router;