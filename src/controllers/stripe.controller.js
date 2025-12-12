const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { stripeService } = require('../services');
const ApiError = require('../utils/ApiError');
const User = require('../models/user.model');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../config/logger');

/**
 * Get Stripe publishable key
 */
const getPublishableKey = catchAsync(async (req, res) => {
  const config = require('../config/config');
  
  res.status(httpStatus.OK).json({
    success: true,
    publishableKey: config.stripe.publishableKey,
  });
});

/**
 * Create setup intent for saving payment methods
 */
const createSetupIntent = catchAsync(async (req, res) => {
  const userId = req.user.id;
  
  // Get or create Stripe customer
  const customer = await stripeService.getStripeCustomer(userId);
  
  // Create setup intent
  const setupIntent = await stripeService.createSetupIntent(customer.id);
  
  res.status(httpStatus.OK).json({
    success: true,
    clientSecret: setupIntent.client_secret,
    customerId: customer.id,
  });
});

/**
 * Get saved payment methods
 */
const getPaymentMethods = catchAsync(async (req, res) => {
  const userId = req.user.id;
  
  // Get Stripe customer
  const customer = await stripeService.getStripeCustomer(userId);
  
  // Get payment methods
  const paymentMethods = await stripeService.getPaymentMethods(customer.id);
  
  // Format response
  const formattedMethods = paymentMethods.map(pm => ({
    id: pm.id,
    brand: pm.card.brand,
    last4: pm.card.last4,
    expMonth: pm.card.exp_month,
    expYear: pm.card.exp_year,
    created: pm.created,
  }));
  
  res.status(httpStatus.OK).json({
    success: true,
    paymentMethods: formattedMethods,
  });
});

/**
 * Delete a payment method
 */
const deletePaymentMethod = catchAsync(async (req, res) => {
  const { paymentMethodId } = req.params;
  
  await stripeService.deletePaymentMethod(paymentMethodId);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Payment method deleted successfully',
  });
});

/**
 * Create payment intent for purchase
 */
const createPaymentIntent = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    amount,
    currency = 'usd',
    description,
    musicId,
    songName,
    licenseType,
    paymentMethodId,
    savePaymentMethod = false,
  } = req.body;

  if (!amount || amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid amount is required');
  }

  const result = await stripeService.processPurchase({
    userId,
    amount,
    currency,
    description: description || `Purchase: ${songName} - ${licenseType}`,
    metadata: {
      musicId,
      songName,
      licenseType,
      userId,
    },
    paymentMethodId,
    savePaymentMethod,
  });

  if (!result.success) {
    throw new ApiError(httpStatus.BAD_REQUEST, result.error);
  }

  res.status(httpStatus.OK).json({
    success: true,
    clientSecret: result.clientSecret,
    paymentIntentId: result.paymentIntent.id,
    customerId: result.customerId,
    requiresAction: result.requiresAction,
    status: result.paymentIntent.status,
  });
});

/**
 * Confirm payment intent
 */
const confirmPaymentIntent = catchAsync(async (req, res) => {
  const { paymentIntentId } = req.params;
  const { paymentMethodId } = req.body;

  const paymentIntent = await stripeService.confirmPaymentIntent(
    paymentIntentId,
    paymentMethodId
  );

  res.status(httpStatus.OK).json({
    success: true,
    paymentIntent: {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    },
    requiresAction: paymentIntent.status === 'requires_action',
  });
});

/**
 * Get payment intent status
 */
const getPaymentIntent = catchAsync(async (req, res) => {
  const { paymentIntentId } = req.params;

  const paymentIntent = await stripeService.getPaymentIntent(paymentIntentId);

  res.status(httpStatus.OK).json({
    success: true,
    paymentIntent: {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
    },
  });
});

/**
 * Create refund
 */
const createRefund = catchAsync(async (req, res) => {
  const { paymentIntentId } = req.params;
  const { amount } = req.body;

  const refund = await stripeService.createRefund(paymentIntentId, amount);

  res.status(httpStatus.OK).json({
    success: true,
    refund: {
      id: refund.id,
      amount: refund.amount,
      status: refund.status,
      reason: refund.reason,
    },
  });
});

/**
 * Get user's Stripe balance (virtual balance for demo)
 */
const getStripeBalance = catchAsync(async (req, res) => {
  const userId = req.user.id;
  
  // Get Stripe customer
  const customer = await stripeService.getStripeCustomer(userId);
  
  // Get payment methods count as a "balance" indicator
  const paymentMethods = await stripeService.getPaymentMethods(customer.id);
  
  // Simulate Stripe balance based on saved payment methods
  const simulatedBalance = paymentMethods.length > 0 ? 1000.00 : 0.00;
  
  res.status(httpStatus.OK).json({
    success: true,
    balance: simulatedBalance,
    currency: 'USD',
    hasPaymentMethods: paymentMethods.length > 0,
    paymentMethodsCount: paymentMethods.length,
    stripeCustomerId: customer.id,
  });
});


/**
 * Handle return URL for Stripe payment redirects
 */
const handleReturnUrl = catchAsync(async (req, res) => {
  const { payment_intent, payment_intent_client_secret, redirect_status } = req.query;
  
  // Log the return for debugging
  const logger = require('../config/logger');
  logger.info('Stripe return URL accessed', { 
    payment_intent, 
    redirect_status,
    query: req.query 
  });
  
  // For successful redirects, show success page or redirect to frontend
  if (redirect_status === 'succeeded' && payment_intent) {
    // In production, redirect to frontend success page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/purchase-success?payment_intent=${payment_intent}&status=${redirect_status}`);
  } else if (redirect_status === 'failed') {
    // Redirect to frontend error page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/payment-error?status=${redirect_status}`);
  }
  
  // Default response
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Payment redirect processed',
    payment_intent,
    redirect_status
  });
});

/**
 * Handle Stripe Connect OAuth callback
 */
const handleStripeCallback = catchAsync(async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    if (error) {
      console.error('Stripe OAuth error:', error);
      return res.redirect(`${frontendUrl}/settings?stripe_error=oauth_denied`);
    }

    if (!code || !state) {
      console.error('Missing code or state in Stripe callback');
      return res.redirect(`${frontendUrl}/settings?stripe_error=no_code`);
    }

    // Find user by state
    const user = await User.findOne({
      stripeConnectState: state,
      stripeConnectStateExpiry: { $gt: new Date() }
    });

    if (!user) {
      console.error('Invalid or expired state in Stripe callback:', state);
      return res.redirect(`${frontendUrl}/settings?stripe_error=callback_failed`);
    }

    // Exchange code for access token
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code,
    });

    const {
      stripe_user_id: accountId,
      access_token: accessToken,
      refresh_token: refreshToken,
      scope,
    } = response;

    // Get account details
    const account = await stripe.accounts.retrieve(accountId);
    
    // Update user with Stripe account info
    await User.findByIdAndUpdate(user._id, {
      stripeAccountId: accountId,
      stripeAccountDetails: {
        accountId,
        accessToken, // In production, encrypt this
        refreshToken, // In production, encrypt this
        scope,
        accountEmail: account.email,
        accountName: account.display_name || account.business_profile?.name,
        country: account.country,
        currency: account.default_currency,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        connectedAt: new Date(),
      },
      $unset: {
        stripeConnectState: 1,
        stripeConnectStateExpiry: 1,
      },
    });

    console.log('Stripe account connected successfully for user:', user._id);

    // Redirect to frontend with success
    res.redirect(`${frontendUrl}/settings?stripe_connected=true&account_name=${encodeURIComponent(account.display_name || account.business_profile?.name || 'Connected Account')}`);

  } catch (error) {
    console.error('Error in Stripe callback:', error);
    res.redirect(`${frontendUrl}/settings?stripe_error=callback_failed`);
  }
});

module.exports = {
  getPublishableKey,
  handleReturnUrl,
  createSetupIntent,
  getPaymentMethods,
  deletePaymentMethod,
  createPaymentIntent,
  confirmPaymentIntent,
  getPaymentIntent,
  createRefund,
  getStripeBalance,
  handleStripeCallback,
};
