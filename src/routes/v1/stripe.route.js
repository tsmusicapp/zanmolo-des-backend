const express = require('express');
const auth = require('../../middlewares/auth');
const stripeController = require('../../controllers/stripe.controller');

const router = express.Router();

// Get publishable key (public endpoint)
router.get('/config', stripeController.getPublishableKey);

// Return URL for payment redirects (public endpoint)
router.get('/return', stripeController.handleReturnUrl);

// Stripe Connect OAuth callback (public endpoint)
router.get('/callback', stripeController.handleStripeCallback);

// Protected routes
router.use(auth());

// Setup intents for saving payment methods
router.post('/setup-intent', stripeController.createSetupIntent);

// Payment methods
router.get('/payment-methods', stripeController.getPaymentMethods);
router.delete('/payment-methods/:paymentMethodId', stripeController.deletePaymentMethod);

// Payment intents
router.post('/payment-intent', stripeController.createPaymentIntent);
router.get('/payment-intent/:paymentIntentId', stripeController.getPaymentIntent);
router.post('/payment-intent/:paymentIntentId/confirm', stripeController.confirmPaymentIntent);


// Refunds
router.post('/payment-intent/:paymentIntentId/refund', stripeController.createRefund);

// Balance
router.get('/balance', stripeController.getStripeBalance);

module.exports = router;
