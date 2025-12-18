const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { purchaseController } = require('../../controllers');
const { purchaseValidation } = require('../../validations');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for download endpoints
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 download requests per windowMs
  message: 'Too many download requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Purchase History Routes
router.post('/create', auth(), purchaseController.createPurchase);
router.post('/stripe', auth(), purchaseController.createStripePurchase);

// Gig order routes
router.post('/gig-order', auth(), purchaseController.createGigOrder);
router.post('/gig-order/stripe', auth(), purchaseController.createStripeGigOrder);

router.get('/history', auth(), validate(purchaseValidation.getPurchaseHistory), purchaseController.getPurchaseHistory);
router.get('/history/:purchaseId', auth(), validate(purchaseValidation.getPurchaseDetails), purchaseController.getPurchaseDetails);
router.post('/history/:purchaseId/download', auth(), downloadLimiter, validate(purchaseValidation.generateDownloadUrl), purchaseController.generateDownloadUrl);
router.get('/history/:purchaseId/download/:token', auth(), downloadLimiter, validate(purchaseValidation.downloadPurchasedFile), purchaseController.downloadPurchasedFile);

// Simple download endpoint
router.get('/history/:purchaseId/download', auth(), downloadLimiter, purchaseController.downloadFile);

// Sales Data Routes (for creators)
router.get('/sales', auth(), validate(purchaseValidation.getSalesData), purchaseController.getSalesData);

module.exports = router;
