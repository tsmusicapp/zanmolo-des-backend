const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { orderHistoryController } = require('../../controllers');
const { orderHistoryValidation } = require('../../validations');
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

// Order History Routes
router.get('/history', auth('user', 'recruiter'), validate(orderHistoryValidation.getOrderHistory), orderHistoryController.getOrderHistory);
router.get('/history/:orderId', auth('user', 'recruiter'), validate(orderHistoryValidation.getOrderDetails), orderHistoryController.getOrderDetails);
router.post('/history/:orderId/files/:fileId/download', auth('user', 'recruiter'), downloadLimiter, validate(orderHistoryValidation.generateOrderDownloadUrl), orderHistoryController.generateOrderDownloadUrl);
router.get('/history/:orderId/files/:fileId/download/:token', auth('user', 'recruiter'), downloadLimiter, validate(orderHistoryValidation.downloadOrderFile), orderHistoryController.downloadOrderFile);

// Order Statistics
router.get('/stats', auth('user', 'recruiter'), orderHistoryController.getOrderStats);

module.exports = router;
