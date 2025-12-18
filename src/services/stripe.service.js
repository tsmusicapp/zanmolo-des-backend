const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');

// Initialize Stripe with secret key
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Stripe logging helper
const logStripeRequest = (operation, request, response, error = null) => {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    operation,
    request: JSON.stringify(request, null, 2),
    response: response ? JSON.stringify(response, null, 2) : null,
    error: error ? error.message : null,
    stack: error ? error.stack : null
  };
  
  const logString = `
=== STRIPE ${operation.toUpperCase()} LOG ===
Timestamp: ${timestamp}
Operation: ${operation}

REQUEST:
${logData.request}

RESPONSE:
${logData.response || 'No response'}

ERROR:
${logData.error || 'No error'}

${logData.stack || ''}
==============================================

`;

  const logFile = path.join(logsDir, `stripe-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logString);
  
  logger.info(`Stripe ${operation} logged to file`);
};

/**
 * Create a Stripe customer for a user
 * @param {Object} userData - User data containing name, email
 * @returns {Promise<Object>} - Stripe customer object
 */
const createStripeCustomer = async (userData) => {
  try {
    // Ensure userId is valid and convert to string
    const userId = userData.userId ? userData.userId.toString() : 'unknown';
    
    const customer = await stripe.customers.create({
      name: userData.name,
      email: userData.email,
      metadata: {
        userId: userId,
      },
    });
    
    return customer;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to create Stripe customer: ${error.message}`);
  }
};

/**
 * Get Stripe customer by user ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Stripe customer object
 */
const getStripeCustomer = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    if (user.stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);
        return customer;
      } catch (error) {
        // If customer doesn't exist, create a new one
        if (error.code === 'resource_missing') {
          const newCustomer = await createStripeCustomer({
            name: user.name,
            email: user.email,
            userId: userId,
          });
          
          // Update user with new Stripe customer ID
          user.stripeCustomerId = newCustomer.id;
          await user.save();
          
          return newCustomer;
        }
        throw error;
      }
    } else {
      // Create new customer if doesn't exist
      const customer = await createStripeCustomer({
        name: user.name,
        email: user.email,
        userId: userId,
      });
      
      // Save Stripe customer ID to user
      user.stripeCustomerId = customer.id;
      await user.save();
      
      return customer;
    }
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to get Stripe customer: ${error.message}`);
  }
};

/**
 * Create a setup intent for saving payment methods
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Object>} - Setup intent object
 */
const createSetupIntent = async (customerId) => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    });
    
    return setupIntent;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to create setup intent: ${error.message}`);
  }
};

/**
 * Get saved payment methods for a customer
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Array>} - Array of payment methods
 */
const getPaymentMethods = async (customerId) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    
    return paymentMethods.data;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to get payment methods: ${error.message}`);
  }
};

/**
 * Create a payment intent
 * @param {Object} paymentData - Payment data
 * @returns {Promise<Object>} - Payment intent object
 */
const createPaymentIntent = async (paymentData) => {
  const {
    amount,
    currency = 'usd',
    customerId,
    paymentMethodId,
    metadata = {},
    description,
    savePaymentMethod = false,
  } = paymentData;

  // Convert amount to cents
  const amountInCents = Math.round(amount * 100);

  const intentData = {
    amount: amountInCents,
    currency: currency.toLowerCase(),
    customer: customerId,
    description,
    metadata,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never'
    }
  };

  // If payment method ID is provided, override automatic payment methods
  if (paymentMethodId) {
    delete intentData.automatic_payment_methods;
    intentData.payment_method = paymentMethodId;
    intentData.confirm = true;
    intentData.return_url = `${process.env.BASE_URL || 'http://localhost:5051'}/v1/stripe/return`;
    
    if (savePaymentMethod) {
      intentData.setup_future_usage = 'off_session';
    }
  } else {
    // For automatic payment methods, use test mode confirmation
    if (process.env.NODE_ENV === 'development' || process.env.STRIPE_TEST_MODE === 'true') {
      // In test mode, create a test payment method and confirm immediately
      const testPaymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
          token: 'tok_visa' // Use test token
        }
      });
      
      intentData.payment_method = testPaymentMethod.id;
      intentData.confirm = true; // This ensures the payment is confirmed
      intentData.return_url = `${process.env.BASE_URL || 'http://localhost:5051'}/v1/stripe/return`;
    }
  }

  try {
    logger.info('Creating Stripe payment intent', { 
      amount: amountInCents, 
      currency, 
      customerId, 
      paymentMethodId,
      description 
    });
    logStripeRequest('CREATE_PAYMENT_INTENT', intentData);

    const paymentIntent = await stripe.paymentIntents.create(intentData);
    
    logStripeRequest('CREATE_PAYMENT_INTENT', intentData, paymentIntent);
    logger.info('Payment intent created successfully', { 
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status 
    });
    
    return paymentIntent;
  } catch (error) {
    logStripeRequest('CREATE_PAYMENT_INTENT', intentData, null, error);
    logger.error('Failed to create payment intent:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to create payment intent: ${error.message}`);
  }
};

/**
 * Confirm a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 * @param {string} paymentMethodId - Payment method ID (optional)
 * @returns {Promise<Object>} - Confirmed payment intent
 */
const confirmPaymentIntent = async (paymentIntentId, paymentMethodId = null) => {
  try {
    const confirmData = {};
    if (paymentMethodId) {
      confirmData.payment_method = paymentMethodId;
    }

    const paymentIntent = await stripe.paymentIntents.confirm(
      paymentIntentId,
      confirmData
    );
    
    return paymentIntent;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to confirm payment: ${error.message}`);
  }
};

/**
 * Retrieve a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 * @returns {Promise<Object>} - Payment intent object
 */
const getPaymentIntent = async (paymentIntentId) => {
  try {
    logger.info('Retrieving Stripe payment intent', { paymentIntentId });
    logStripeRequest('GET_PAYMENT_INTENT', { paymentIntentId });
    
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    logStripeRequest('GET_PAYMENT_INTENT', { paymentIntentId }, paymentIntent);
    logger.info('Payment intent retrieved successfully', { 
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status 
    });
    
    return paymentIntent;
  } catch (error) {
    logStripeRequest('GET_PAYMENT_INTENT', { paymentIntentId }, null, error);
    logger.error('Failed to retrieve payment intent:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to retrieve payment intent: ${error.message}`);
  }
};

/**
 * Create a refund
 * @param {string} paymentIntentId - Payment intent ID
 * @param {number} amount - Refund amount (optional, defaults to full refund)
 * @returns {Promise<Object>} - Refund object
 */
const createRefund = async (paymentIntentId, amount = null) => {
  try {
    const refundData = {
      payment_intent: paymentIntentId,
    };
    
    if (amount) {
      refundData.amount = Math.round(amount * 100); // Convert to cents
    }

    const refund = await stripe.refunds.create(refundData);
    return refund;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to create refund: ${error.message}`);
  }
};

/**
 * Delete a payment method
 * @param {string} paymentMethodId - Payment method ID
 * @returns {Promise<Object>} - Deleted payment method
 */
const deletePaymentMethod = async (paymentMethodId) => {
  try {
    const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);
    return paymentMethod;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to delete payment method: ${error.message}`);
  }
};

/**
 * Get Stripe balance (for admin purposes)
 * @returns {Promise<Object>} - Stripe balance object
 */
const getStripeBalance = async () => {
  try {
    const balance = await stripe.balance.retrieve();
    return balance;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to get Stripe balance: ${error.message}`);
  }
};

/**
 * Process a purchase with Stripe
 * @param {Object} purchaseData - Purchase data
 * @returns {Promise<Object>} - Payment result
 */
const processPurchase = async (purchaseData) => {
  try {
    const {
      userId,
      amount,
      currency = 'usd',
      description,
      metadata = {},
      paymentMethodId = null,
      savePaymentMethod = false,
    } = purchaseData;

    // Get or create Stripe customer
    const customer = await getStripeCustomer(userId);

    // Create payment intent
    const paymentIntent = await createPaymentIntent({
      amount,
      currency,
      customerId: customer.id,
      paymentMethodId,
      metadata: {
        ...metadata,
        userId: userId.toString(),
        timestamp: new Date().toISOString(),
      },
      description,
      savePaymentMethod,
    });

    return {
      success: true,
      paymentIntent,
      customerId: customer.id,
      requiresAction: paymentIntent.status === 'requires_action',
      clientSecret: paymentIntent.client_secret,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};


/**
 * Create a payment method with card data
 * @param {Object} paymentMethodData - Payment method data
 * @returns {Promise<Object>} - Created payment method
 */
const createPaymentMethod = async (paymentMethodData) => {
  try {
    const maskedData = { ...paymentMethodData };
    if (maskedData.card) {
      maskedData.card = '***MASKED***';
    }
    
    logger.info('Creating Stripe payment method', maskedData);
    logStripeRequest('CREATE_PAYMENT_METHOD', maskedData);
    
    const paymentMethod = await stripe.paymentMethods.create(paymentMethodData);
    
    logStripeRequest('CREATE_PAYMENT_METHOD', maskedData, paymentMethod);
    logger.info('Payment method created successfully', { paymentMethodId: paymentMethod.id });
    
    return paymentMethod;
  } catch (error) {
    const maskedData = { ...paymentMethodData };
    if (maskedData.card) {
      maskedData.card = '***MASKED***';
    }
    logStripeRequest('CREATE_PAYMENT_METHOD', maskedData, null, error);
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to create payment method: ${error.message}`);
  }
};

/**
 * Attach payment method to customer
 * @param {string} paymentMethodId - Payment method ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>} - Attached payment method
 */
const attachPaymentMethod = async (paymentMethodId, customerId) => {
  try {
    logger.info('Attaching payment method to customer', { paymentMethodId, customerId });
    logStripeRequest('ATTACH_PAYMENT_METHOD', { paymentMethodId, customerId });
    
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
    
    logStripeRequest('ATTACH_PAYMENT_METHOD', { paymentMethodId, customerId }, paymentMethod);
    logger.info('Payment method attached successfully', { 
      paymentMethodId: paymentMethod.id,
      customerId: paymentMethod.customer 
    });
    
    return paymentMethod;
  } catch (error) {
    logStripeRequest('ATTACH_PAYMENT_METHOD', { paymentMethodId, customerId }, null, error);
    logger.error('Failed to attach payment method:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to attach payment method: ${error.message}`);
  }
};

module.exports = {
  createStripeCustomer,
  getStripeCustomer,
  createSetupIntent,
  createPaymentMethod,
  attachPaymentMethod,
  getPaymentMethods,
  createPaymentIntent,
  confirmPaymentIntent,
  getPaymentIntent,
  createRefund,
  deletePaymentMethod,
  getStripeBalance,
  processPurchase,
};
