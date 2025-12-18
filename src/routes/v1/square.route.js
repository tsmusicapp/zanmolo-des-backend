const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const squareController = require('../../controllers/square.controller');
const squareValidation = require('../../validations/square.validation');

const router = express.Router();

// OAuth routes
router.get('/connect', squareController.connectSquare); // Remove auth() untuk allow token via query param
router.get('/callback', squareController.squareCallback);

// Fallback route for undefined path issue
router.get('/undefined/settings', (req, res) => {
  console.log('Caught undefined path redirect with query:', req.query);
  
  // Get dynamic frontend URL
  const frontendUrl = process.env.FRONTEND_URL || 
                     (process.env.NODE_ENV === 'production' 
                       ? 'https://musicapp2025-fe1.vercel.app'
                       : `http://localhost:${process.env.FRONTEND_PORT || '3000'}`);
  
  // Extract error from query and redirect properly
  const error = req.query.square_error || 'undefined_path_error';
  res.redirect(`${frontendUrl}/settings?square_error=${error}`);
});

// Status and management routes
router.get('/status', auth(), squareController.getSquareStatus);
router.get('/balance', auth(), squareController.getSquareBalance);
router.put('/merchant-info', auth(), squareController.updateMerchantInfo);
router.delete('/disconnect', auth(), squareController.disconnectSquare);

// Payment routes
router.post('/payment', auth(), squareController.createSimplePayment); // New simple payment endpoint
router.get('/payment-test', squareController.testSquareConfig); // Test endpoint without auth for debugging
router.post('/payment-test', squareController.createSimplePayment); // Test payment without auth - FOR DEBUGGING ONLY
router.post('/payments', auth(), validate(squareValidation.createPayment), squareController.createPayment);
router.post('/purchase-music', auth(), squareController.createMusicPayment);
router.get('/payments/:paymentId', auth(), validate(squareValidation.getPayment), squareController.getPayment);
router.get('/payments', auth(), validate(squareValidation.listPayments), squareController.listPayments);

// Test endpoint
router.get('/test-config', squareController.testSquareConfig);
router.get('/debug-config', squareController.testSquareConfig); // Additional alias for debugging
router.get('/test-oauth', squareController.testSquareOAuth); // Test OAuth URL generation
router.get('/test-balance/:userId', squareController.testSquareBalance); // For testing only
router.get('/debug-users', squareController.debugSquareUsers); // Debug endpoint
router.get('/logs', squareController.getSquareLogs); // Square activity logs
router.get('/raw-data', auth(), squareController.getSquareRawData); // Square raw data for user

module.exports = router;
