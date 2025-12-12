const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, userService } = require('../services');
const squareService = require('../services/squareService');
const ApiError = require('../utils/ApiError');
const { v4: uuidv4 } = require('uuid');
const { purchaseController } = require('./index');
const config = require('../config/config');

// Helper function to get dynamic frontend URL
const getFrontendUrl = () => {
  // Priority: config value > environment variable > default based on NODE_ENV
  return config.frontend?.url || 
         process.env.FRONTEND_URL || 
         (process.env.NODE_ENV === 'production' 
           ? 'https://musicapp2025-fe1.vercel.app'
           : `http://localhost:${process.env.FRONTEND_PORT || '3000'}`);
};

// Helper function to get dynamic backend URL for redirects
const getBackendUrl = () => {
  return config.square?.redirectUri?.replace('/v1/square/callback', '') ||
         process.env.BACKEND_URL ||
         (process.env.NODE_ENV === 'production' 
           ? 'https://musicapp2025-be.vercel.app'
           : `http://localhost:${process.env.PORT || '5051'}`);
};

const connectSquare = catchAsync(async (req, res) => {
  console.log('Square connect initiated:', { query: req.query, user: req.user?.id });
  console.log('Environment:', process.env.NODE_ENV);
  
  // Log connect start
  await squareService.logSquareActivity('oauth_connect_start', {
    userId: req.user?.id,
    hasUser: !!req.user,
    hasTokenQuery: !!req.query.token,
    environment: process.env.NODE_ENV,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
  
  // Get dynamic frontend URL
  const frontendUrl = getFrontendUrl();
  console.log('Using frontend URL:', frontendUrl);
  
  // Get user from auth middleware or token query param for redirect scenario
  let userId;
  if (req.user) {
    userId = req.user.id;
  } else if (req.query.token) {
    // Verify token from query param for redirect scenario
    try {
      const token = req.query.token;
      const decoded = require('jsonwebtoken').verify(token, config.jwt.secret);
      userId = decoded.sub;
      console.log('User ID from token:', userId);
      
      await squareService.logSquareActivity('oauth_connect_token_verified', {
        userId: userId,
        tokenSource: 'query_param'
      });
    } catch (error) {
      console.error('Token verification error:', error.message);
      
      await squareService.logSquareActivity('oauth_connect_token_error', {
        error: error.message,
        tokenSource: 'query_param'
      });
      
      return res.redirect(`${frontendUrl}/settings?square_error=invalid_token`);
    }
  } else {
    console.error('No authentication provided');
    
    await squareService.logSquareActivity('oauth_connect_no_auth', {
      frontendUrl: frontendUrl
    });
    
    return res.redirect(`${frontendUrl}/settings?square_error=authentication_required`);
  }
  
  const state = `${userId}_${uuidv4()}`;
  
  await squareService.logSquareActivity('oauth_connect_state_generated', {
    userId: userId,
    stateLength: state.length
  });
  
  // Store state in database instead of session for better reliability
  try {
    const User = require('../models/user.model');
    await User.findByIdAndUpdate(userId, { 
      squareOAuthState: state,
      squareOAuthExpiry: new Date(Date.now() + 300000) // 5 minutes
    });
    console.log('State stored in database:', state);
    
    await squareService.logSquareActivity('oauth_connect_state_stored_db', {
      userId: userId
    });
  } catch (dbError) {
    console.error('Error storing state:', dbError);
    
    await squareService.logSquareActivity('oauth_connect_state_db_error', {
      userId: userId,
      error: dbError.message
    });
    
    // Fallback to session
    req.session.squareState = state;
    
    await squareService.logSquareActivity('oauth_connect_state_stored_session', {
      userId: userId
    });
  }
  
  console.log('Generated state:', state);
  
  try {
    const oauthUrl = squareService.getOAuthUrl(state);
    console.log('Redirecting to OAuth URL:', oauthUrl);
    
    await squareService.logSquareActivity('oauth_connect_redirect', {
      userId: userId,
      oauthUrl: oauthUrl
    });
    
    res.redirect(oauthUrl);
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    
    await squareService.logSquareActivity('oauth_connect_url_error', {
      userId: userId,
      error: error.message
    });
    
    res.redirect(`${frontendUrl}/settings?square_error=oauth_url_error`);
  }
});

const squareCallback = catchAsync(async (req, res) => {
  const { code, state, error } = req.query;
  console.log('Square callback received:', { code: !!code, state, error });
  console.log('Frontend URL from config:', config.frontend?.url);
  console.log('Environment:', process.env.NODE_ENV);
  
  // Log callback start
  await squareService.logSquareActivity('oauth_callback_start', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!error,
    errorType: error,
    environment: process.env.NODE_ENV,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
  
  // Get dynamic frontend URL
  const frontendUrl = getFrontendUrl();
  console.log('Using frontend URL:', frontendUrl);

  if (error) {
    console.error('Square OAuth error:', error);
    await squareService.logSquareActivity('oauth_callback_error', {
      error: error,
      frontendUrl: frontendUrl
    });
    return res.redirect(`${frontendUrl}/settings?square_error=${error}`);
  }

  if (!code) {
    console.error('No authorization code provided');
    await squareService.logSquareActivity('oauth_callback_no_code', {
      frontendUrl: frontendUrl
    });
    return res.redirect(`${frontendUrl}/settings?square_error=no_code`);
  }

  if (!state) {
    console.error('No state provided in callback');
    await squareService.logSquareActivity('oauth_callback_no_state', {
      frontendUrl: frontendUrl
    });
    return res.redirect(`${frontendUrl}/settings?square_error=no_session_state`);
  }

  // Validate state format
  const stateParts = state.split('_');
  if (stateParts.length < 2) {
    console.error('Invalid state format:', state);
    await squareService.logSquareActivity('oauth_callback_invalid_state_format', {
      state: state,
      frontendUrl: frontendUrl
    });
    return res.redirect(`${frontendUrl}/settings?square_error=invalid_state_format`);
  }

  // Verify state untuk security
  console.log('Session state:', req.session?.squareState);
  console.log('Received state:', state);
  
  // Check state from database first, then fallback to session
  const userId = stateParts[0];
  console.log('Extracted userId from state:', userId);
  
  await squareService.logSquareActivity('oauth_callback_verify_state', {
    userId: userId,
    state: state,
    sessionState: req.session?.squareState
  });
  
  let isValidState = false;
  
  try {
    const User = require('../models/user.model');
    const user = await User.findById(userId);
    if (user && user.squareOAuthState === state && user.squareOAuthExpiry > new Date()) {
      isValidState = true;
      console.log('State verified from database');
      
      await squareService.logSquareActivity('oauth_callback_state_verified_db', {
        userId: userId
      });
      
      // Clear the state from database
      await User.findByIdAndUpdate(userId, { 
        $unset: { squareOAuthState: 1, squareOAuthExpiry: 1 }
      });
    }
  } catch (dbError) {
    console.error('Error checking state from database:', dbError);
    await squareService.logSquareActivity('oauth_callback_state_db_error', {
      userId: userId,
      error: dbError.message
    });
  }
  
  // Fallback to session verification
  if (!isValidState && req.session?.squareState) {
    const sessionUserId = req.session.squareState.split('_')[0];
    const receivedUserId = state.split('_')[0];
    
    if (sessionUserId === receivedUserId) {
      isValidState = true;
      console.log('State verified from session');
      
      await squareService.logSquareActivity('oauth_callback_state_verified_session', {
        userId: userId,
        sessionUserId: sessionUserId,
        receivedUserId: receivedUserId
      });
      
      delete req.session.squareState;
    }
  }
  
  if (!isValidState) {
    console.error('No valid state found');
    console.log('Redirecting to:', `${frontendUrl}/settings?square_error=invalid_state`);
    
    await squareService.logSquareActivity('oauth_callback_invalid_state', {
      userId: userId,
      state: state,
      frontendUrl: frontendUrl
    });
    
    return res.redirect(`${frontendUrl}/settings?square_error=invalid_state`);
  }

  try {
    console.log('Exchanging code for token...');
    
    await squareService.logSquareActivity('oauth_callback_token_exchange_start', {
      userId: userId
    });
    
    // Exchange code for token
    const tokenData = await squareService.exchangeCodeForToken(code);
    console.log('Token exchange successful');
    
    // Save credentials to user - using already extracted userId from state validation above
    await squareService.saveUserSquareCredentials(userId, tokenData);
    console.log('Credentials saved for user:', userId);
    
    // Get and save merchant info - use try-catch to prevent failure if this step fails
    try {
      console.log('Getting merchant info...');
      const merchantData = await squareService.getMerchantInfo(userId);
      if (merchantData && merchantData.merchant) {
        const User = require('../models/user.model');
        
        // Update user with merchant info - use $set to ensure proper update
        const updateResult = await User.findByIdAndUpdate(userId, {
          $set: {
            'squareMerchantInfo.id': merchantData.merchant.id,
            'squareMerchantInfo.businessName': merchantData.merchant.businessName,
            'squareMerchantInfo.country': merchantData.merchant.country,
            'squareMerchantInfo.languageCode': merchantData.merchant.languageCode,
            'squareMerchantInfo.currency': merchantData.merchant.currency,
            'squareMerchantInfo.status': merchantData.merchant.status,
            'squareMerchantInfo.mainLocationId': merchantData.merchant.mainLocationId,
            'squareMerchantInfo.createdAt': merchantData.merchant.createdAt,
            'squareMerchantInfo.updatedAt': new Date()
          }
        }, { 
          new: true,
          upsert: false // Don't create if not exists, should already exist from saveUserSquareCredentials
        });
        
        console.log('Merchant info saved for user:', userId, 'Update result:', !!updateResult);
        
        await squareService.logSquareActivity('oauth_callback_merchant_saved', {
          userId: userId,
          merchantId: merchantData.merchant.id,
          businessName: merchantData.merchant.businessName,
          status: merchantData.merchant.status,
          updateSuccessful: !!updateResult
        });
      } else {
        console.log('No merchant data received from API');
        await squareService.logSquareActivity('oauth_callback_no_merchant_data', {
          userId: userId,
          merchantDataExists: !!merchantData,
          merchantExists: !!(merchantData && merchantData.merchant)
        });
      }
    } catch (merchantError) {
      console.error('Error saving merchant info:', merchantError.message);
      
      await squareService.logSquareActivity('oauth_callback_merchant_error', {
        userId: userId,
        error: merchantError.message,
        stack: merchantError.stack
      });
      // Don't fail the whole process if merchant info fails
    }
    
    // Clear state from session
    delete req.session.squareState;
    
    await squareService.logSquareActivity('oauth_callback_success', {
      userId: userId,
      redirectUrl: `${frontendUrl}/settings?square_connected=true`
    });
    
    // Redirect to frontend success page
    res.redirect(`${frontendUrl}/settings?square_connected=true`);
  } catch (error) {
    console.error('Square callback error:', error);
    
    await squareService.logSquareActivity('oauth_callback_final_error', {
      userId: userId,
      error: error.message,
      stack: error.stack
    });
    
    res.redirect(`${frontendUrl}/settings?square_error=${encodeURIComponent(error.message)}`);
  }
});

const getSquareStatus = catchAsync(async (req, res) => {
  const userId = req.user.id;
  
  await squareService.logSquareActivity('get_status_start', {
    userId: userId
  });
  
  const isConnected = await squareService.isUserConnected(userId);
  
  let merchantInfo = null;
  if (isConnected) {
    try {
      // First try to get merchant info from database
      const User = require('../models/user.model');
      const user = await User.findById(userId).select('squareMerchantInfo');
      
      if (user && user.squareMerchantInfo && user.squareMerchantInfo.id) {
        merchantInfo = user.squareMerchantInfo;
        console.log('Using cached merchant info from database');
        
        await squareService.logSquareActivity('get_status_merchant_from_db', {
          userId: userId,
          merchantId: merchantInfo.id,
          businessName: merchantInfo.businessName
        });
      } else {
        // Fallback to API call and save to database
        console.log('Fetching merchant info from Square API...');
        const apiMerchantData = await squareService.getMerchantInfo(userId);
        if (apiMerchantData && apiMerchantData.merchant) {
          merchantInfo = apiMerchantData.merchant;
          
          // Save to database for future use using $set
          const updateResult = await User.findByIdAndUpdate(userId, {
            $set: {
              'squareMerchantInfo.id': merchantInfo.id,
              'squareMerchantInfo.businessName': merchantInfo.businessName,
              'squareMerchantInfo.country': merchantInfo.country,
              'squareMerchantInfo.languageCode': merchantInfo.languageCode,
              'squareMerchantInfo.currency': merchantInfo.currency,
              'squareMerchantInfo.status': merchantInfo.status,
              'squareMerchantInfo.mainLocationId': merchantInfo.mainLocationId,
              'squareMerchantInfo.createdAt': merchantInfo.createdAt,
              'squareMerchantInfo.updatedAt': new Date()
            }
          }, {
            new: true,
            upsert: false
          });
          
          console.log('Merchant info cached to database:', !!updateResult);
          
          await squareService.logSquareActivity('get_status_merchant_from_api', {
            userId: userId,
            merchantId: merchantInfo.id,
            businessName: merchantInfo.businessName,
            updateSuccessful: !!updateResult
          });
        }
      }
    } catch (error) {
      // Token might be expired or invalid
      console.error('Error getting merchant info:', error.message);
      
      await squareService.logSquareActivity('get_status_merchant_error', {
        userId: userId,
        error: error.message
      });
    }
  }

  await squareService.logSquareActivity('get_status_response', {
    userId: userId,
    isConnected: isConnected,
    hasMerchantInfo: !!merchantInfo
  });

  res.json({
    isConnected,
    merchantInfo
  });
});

const disconnectSquare = catchAsync(async (req, res) => {
  const userId = req.user.id;
  await squareService.disconnectSquare(userId);
  
  // Clear all Square-related data from database using $unset
  const User = require('../models/user.model');
  const updateResult = await User.findByIdAndUpdate(userId, {
    $unset: { 
      squareMerchantInfo: 1,
      squareRawData: 1,
      squareOAuthState: 1,
      squareOAuthExpiry: 1
    }
  }, {
    new: true
  });
  
  await squareService.logSquareActivity('disconnect_complete', {
    userId: userId,
    updateSuccessful: !!updateResult
  });
  
  res.json({ 
    message: 'Square account disconnected successfully',
    isConnected: false 
  });
});

// Update merchant info manually
const updateMerchantInfo = catchAsync(async (req, res) => {
  const userId = req.user.id;
  
  const isConnected = await squareService.isUserConnected(userId);
  if (!isConnected) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Square account not connected');
  }

  try {
    console.log('Fetching latest merchant info from Square API...');
    const apiMerchantData = await squareService.getMerchantInfo(userId);
    
    if (apiMerchantData && apiMerchantData.merchant) {
      const merchantInfo = apiMerchantData.merchant;
      
      // Save to database using $set for better control
      const User = require('../models/user.model');
      const updateResult = await User.findByIdAndUpdate(userId, {
        $set: {
          'squareMerchantInfo.id': merchantInfo.id,
          'squareMerchantInfo.businessName': merchantInfo.businessName,
          'squareMerchantInfo.country': merchantInfo.country,
          'squareMerchantInfo.languageCode': merchantInfo.languageCode,
          'squareMerchantInfo.currency': merchantInfo.currency,
          'squareMerchantInfo.status': merchantInfo.status,
          'squareMerchantInfo.mainLocationId': merchantInfo.mainLocationId,
          'squareMerchantInfo.createdAt': merchantInfo.createdAt,
          'squareMerchantInfo.updatedAt': new Date()
        }
      }, {
        new: true,
        upsert: false
      });
      
      res.json({
        message: 'Merchant info updated successfully',
        merchantInfo
      });
    } else {
      throw new ApiError(httpStatus.NOT_FOUND, 'Unable to fetch merchant info');
    }
  } catch (error) {
    console.error('Error updating merchant info:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to update merchant info: ${error.message}`);
  }
});

const createPayment = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { sourceId, amount, currency = 'USD', buyerEmailAddress, note } = req.body;

  if (!sourceId || !amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'sourceId and amount are required');
  }

  const isConnected = await squareService.isUserConnected(userId);
  if (!isConnected) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Square account not connected');
  }

  const paymentData = {
    sourceId,
    idempotencyKey: uuidv4(),
    amount: Math.round(amount * 100), // Convert to cents
    currency,
    buyerEmailAddress,
    note
  };

  const payment = await squareService.createPayment(userId, paymentData);
  
  res.status(httpStatus.CREATED).json({
    message: 'Payment created successfully',
    payment
  });
});

/**
 * Create a Square payment for music purchase
 */
const createMusicPayment = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { musicId, licenseType, licenseId, amount, currency = 'USD' } = req.body;

  if (!musicId || !licenseType || amount === undefined) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'musicId, licenseType, and amount are required');
  }

  const isConnected = await squareService.isUserConnected(userId);
  if (!isConnected) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Square account not connected');
  }

  try {
    // Create Square payment
    const paymentData = {
      sourceId: 'EXTERNAL', // Using balance/external funding
      idempotencyKey: uuidv4(),
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      note: `Music purchase - License: ${licenseType}`
    };

    const payment = await squareService.createPayment(userId, paymentData);

    // If payment successful, create purchase record
    if (payment && payment.status === 'COMPLETED') {
      const purchaseData = {
        musicId,
        amount,
        currency,
        paymentMethod: 'square',
        squarePaymentId: payment.id,
        licenseType,
        licenseId,
        status: 'completed'
      };

      // Create a mock request object for the purchase controller
      const purchaseReq = {
        user: { id: userId },
        body: purchaseData,
        headers: req.headers,
        ip: req.ip
      };

      const purchaseRes = {
        status: (statusCode) => ({
          json: (data) => data
        }),
        json: (data) => data
      };

      // Call purchase controller to create purchase record
      const purchaseResult = await purchaseController.createPurchase(purchaseReq, purchaseRes);
      
      res.status(httpStatus.CREATED).json({
        message: 'Music purchase completed successfully',
        payment,
        purchase: purchaseResult.purchase || purchaseResult
      });
    } else {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Payment failed');
    }
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Payment processing failed: ${error.message}`);
  }
});

const getPayment = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { paymentId } = req.params;

  const isConnected = await squareService.isUserConnected(userId);
  if (!isConnected) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Square account not connected');
  }

  const payment = await squareService.getPayment(userId, paymentId);
  
  res.json({
    payment
  });
});

const listPayments = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { beginTime, endTime, sortOrder, cursor, locationId } = req.query;

  const isConnected = await squareService.isUserConnected(userId);
  if (!isConnected) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Square account not connected');
  }

  const options = {
    beginTime,
    endTime,
    sortOrder,
    cursor,
    locationId
  };

  const payments = await squareService.listPayments(userId, options);
  
  res.json({
    payments: payments.payments || [],
    cursor: payments.cursor
  });
});

const getSquareBalance = catchAsync(async (req, res) => {
  const userId = req.user.id;
  
  await squareService.logSquareActivity('get_balance_controller_start', {
    userId: userId
  });
  
  const isConnected = await squareService.isUserConnected(userId);
  if (!isConnected) {
    await squareService.logSquareActivity('get_balance_not_connected', {
      userId: userId
    });
    throw new ApiError(httpStatus.BAD_REQUEST, 'Square account not connected');
  }

  try {
    const balance = await squareService.getSquareBalance(userId);
    
    await squareService.logSquareActivity('get_balance_controller_success', {
      userId: userId,
      balance: balance.balance || 0,
      currency: balance.currency || 'USD',
      locationId: balance.locationId,
      paymentCount: balance.paymentCount
    });
    
    res.json({
      balance: balance.balance || 0,
      currency: balance.currency || 'USD',
      lastUpdated: new Date().toISOString(),
      isConnected: true
    });
  } catch (error) {
    console.error('Error getting Square balance:', error.message);
    
    await squareService.logSquareActivity('get_balance_controller_error', {
      userId: userId,
      error: error.message
    });
    
    // Return zero balance if there's an error but account is connected
    res.json({
      balance: 0,
      currency: 'USD',
      lastUpdated: new Date().toISOString(),
      isConnected: true,
      error: 'Unable to retrieve balance'
    });
  }
});

// Test configuration endpoint
const testSquareConfig = catchAsync(async (req, res) => {
  console.log('Testing Square configuration...');
  
  const configCheck = {
    hasAccessToken: !!process.env.SQUARE_ACCESS_TOKEN,
    hasLocationId: !!process.env.SQUARE_LOCATION_ID,
    environment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
    nodeEnv: process.env.NODE_ENV,
    accessTokenLength: process.env.SQUARE_ACCESS_TOKEN ? process.env.SQUARE_ACCESS_TOKEN.length : 0,
    locationIdLength: process.env.SQUARE_LOCATION_ID ? process.env.SQUARE_LOCATION_ID.length : 0
  };
  
  console.log('Square config check:', configCheck);
  
  // Try to initialize Square client
  let clientStatus = 'failed';
  let clientError = null;
  
  try {
  const { SquareClient, SquareEnvironment } = require('square');
    
  const squareEnvironment = process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox;
    
  const client = new SquareClient({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: squareEnvironment
    });
    
  const paymentsApi = client.payments;
    clientStatus = 'success';
  } catch (error) {
    clientError = error.message;
    console.error('Square client initialization failed:', error);
  }
  
  const config_info = {
    environment: process.env.NODE_ENV,
    squareConfig: configCheck,
    clientInitialization: {
      status: clientStatus,
      error: clientError
    },
    square: {
      applicationId: config.square?.applicationId ? 'SET' : 'NOT SET',
      applicationSecret: config.square?.applicationSecret ? 'SET' : 'NOT SET',
      environment: config.square?.environment || 'NOT SET',
      redirectUri: config.square?.redirectUri || 'NOT SET',
    },
    frontend: {
      url: config.frontend?.url || 'NOT SET',
    },
    jwt: {
      secret: config.jwt?.secret ? 'SET' : 'NOT SET'
    },
    dynamicUrls: {
      frontendUrl: getFrontendUrl(),
      backendUrl: getBackendUrl(),
      redirectUri: `${getBackendUrl()}/v1/square/callback`
    },
    environmentVariables: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      FRONTEND_PORT: process.env.FRONTEND_PORT,
      VERCEL_URL: process.env.VERCEL_URL,
      FRONTEND_URL: process.env.FRONTEND_URL,
      BACKEND_URL: process.env.BACKEND_URL
    }
  };
  
  console.log('Config info:', config_info);
  res.json(config_info);
});

// Test OAuth URL generation
const testSquareOAuth = catchAsync(async (req, res) => {
  try {
    const { userId } = req.query;
    const testUserId = userId || 'test_user_123';
    const testState = `${testUserId}_test_${Date.now()}`;
    
    // Generate OAuth URL with minimal scope first
    const minimalScope = 'MERCHANT_PROFILE_READ';
    const baseUrl = 'https://connect.squareupsandbox.com';
    const applicationId = config.square.applicationId;
    const redirectUri = encodeURIComponent('http://localhost:5051/v1/square/callback');
    
    const minimalOAuthUrl = `${baseUrl}/oauth2/authorize?client_id=${applicationId}&scope=${minimalScope}&session=false&state=${testState}&redirect_uri=${redirectUri}`;
    
    // Test with different scope combinations
    const fullScope = 'MERCHANT_PROFILE_READ PAYMENTS_READ PAYMENTS_WRITE ORDERS_READ ORDERS_WRITE';
    const fullOAuthUrl = `${baseUrl}/oauth2/authorize?client_id=${applicationId}&scope=${encodeURIComponent(fullScope)}&session=false&state=${testState}&redirect_uri=${redirectUri}`;
    
    await squareService.logSquareActivity('test_oauth_urls', {
      testUserId: testUserId,
      minimalOAuthUrl: minimalOAuthUrl,
      fullOAuthUrl: fullOAuthUrl,
      applicationId: applicationId,
      redirectUri: 'http://localhost:5051/v1/square/callback'
    });
    
    res.json({
      testUserId: testUserId,
      testState: testState,
      applicationId: applicationId,
      redirectUri: 'http://localhost:5051/v1/square/callback',
      urls: {
        minimal: minimalOAuthUrl,
        full: fullOAuthUrl
      },
      recommendations: [
        'Try the minimal scope URL first',
        'Check if your Square application is properly configured',
        'Verify the redirect URI is whitelisted in Square Dashboard',
        'Make sure you are using the correct sandbox Application ID'
      ]
    });
    
  } catch (error) {
    console.error('Error generating test OAuth URLs:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Test balance endpoint (for testing only - remove in production)
const testSquareBalance = catchAsync(async (req, res) => {
  const userId = req.params.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  try {
    const isConnected = await squareService.isUserConnected(userId);
    if (!isConnected) {
      return res.json({ 
        error: 'Square account not connected for this user',
        isConnected: false,
        userId: userId
      });
    }

    const balance = await squareService.getSquareBalance(userId);
    res.json({
      balance: balance.balance || 0,
      currency: balance.currency || 'USD',
      locationId: balance.locationId,
      locationName: balance.locationName,
      lastUpdated: new Date().toISOString(),
      isConnected: true,
      userId: userId
    });
  } catch (error) {
    console.error('Error getting Square balance:', error.message);
    res.json({
      balance: 0,
      currency: 'USD',
      lastUpdated: new Date().toISOString(),
      isConnected: true,
      error: error.message,
      userId: userId
    });
  }
});

// Debug endpoint to check users with Square credentials
const debugSquareUsers = catchAsync(async (req, res) => {
  try {
    const User = require('../models/user.model');
    
    // Find users with Square credentials
    const users = await User.find({ 
      'squareCredentials.accessToken': { $exists: true } 
    }).select('_id email squareCredentials.accessToken').limit(10);
    
    const userList = users.map(user => ({
      userId: user._id.toString(),
      email: user.email || 'No email',
      hasSquareToken: !!user.squareCredentials?.accessToken,
      tokenPreview: user.squareCredentials?.accessToken?.substring(0, 20) + '...'
    }));
    
    res.json({
      totalUsers: users.length,
      users: userList,
      message: users.length === 0 ? 'No users found with Square credentials. Connect via OAuth first.' : 'Users with Square credentials found'
    });
    
  } catch (error) {
    console.error('Error checking Square users:', error.message);
    res.status(500).json({
      error: error.message
    });
  }
});

// Get Square activity logs
const getSquareLogs = catchAsync(async (req, res) => {
  try {
    // Check if we're in serverless environment
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return res.json({
        message: 'File-based logging not available in serverless environment',
        environment: 'serverless',
        suggestion: 'Check console logs in deployment dashboard',
        totalLogs: 0,
        logs: []
      });
    }

    const fs = require('fs').promises;
    const path = require('path');
    
    const { date, operation, limit = 100 } = req.query;
    const logDir = path.join(process.cwd(), 'logs');
    
    let logFile;
    if (date) {
      logFile = path.join(logDir, `square-${date}.log`);
    } else {
      // Get today's log
      const today = new Date().toISOString().split('T')[0];
      logFile = path.join(logDir, `square-${today}.log`);
    }
    
    try {
      const logContent = await fs.readFile(logFile, 'utf8');
      const logs = logContent.split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return { raw: line, parseError: true };
          }
        })
        .filter(log => !operation || log.operation === operation)
        .slice(-limit);
        
      res.json({
        date: date || new Date().toISOString().split('T')[0],
        operation: operation || 'all',
        totalLogs: logs.length,
        logs: logs,
        environment: 'local'
      });
    } catch (fileError) {
      res.json({
        date: date || new Date().toISOString().split('T')[0],
        operation: operation || 'all',
        totalLogs: 0,
        logs: [],
        message: 'No logs found for this date',
        error: fileError.message,
        environment: 'local'
      });
    }
  } catch (error) {
    console.error('Error reading Square logs:', error.message);
    res.status(500).json({
      error: error.message,
      environment: process.env.VERCEL ? 'vercel' : 'local'
    });
  }
});

// Get Square raw data for user
const getSquareRawData = catchAsync(async (req, res) => {
  const userId = req.user.id;
  
  try {
    const User = require('../models/user.model');
    const user = await User.findById(userId).select('squareRawData squareCredentials squareMerchantInfo');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await squareService.logSquareActivity('get_raw_data_request', {
      userId: userId,
      hasRawData: !!user.squareRawData,
      hasCredentials: !!user.squareCredentials,
      hasMerchantInfo: !!user.squareMerchantInfo
    });

    res.json({
      userId: userId,
      hasSquareConnection: !!user.squareCredentials,
      squareRawData: user.squareRawData || null,
      squareCredentials: user.squareCredentials ? {
        merchantId: user.squareCredentials.merchantId,
        tokenType: user.squareCredentials.tokenType,
        expiresAt: user.squareCredentials.expiresAt,
        connectedAt: user.squareCredentials.connectedAt,
        accessTokenPreview: user.squareCredentials.accessToken ? 
          user.squareCredentials.accessToken.substring(0, 20) + '...' : null
      } : null,
      squareMerchantInfo: user.squareMerchantInfo || null,
      lastUpdated: user.squareRawData?.lastUpdated || null
    });
    
  } catch (error) {
    console.error('Error getting Square raw data:', error.message);
    
    await squareService.logSquareActivity('get_raw_data_error', {
      userId: userId,
      error: error.message
    });
    
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * Create a simple payment from nonce (for frontend integration)
 * This endpoint accepts a nonce from Square Web Payments SDK
 */
const createSimplePayment = catchAsync(async (req, res) => {
  console.log('=== CREATE SIMPLE PAYMENT START ===');
  console.log('Request body:', req.body);
  console.log('User:', req.user?.id);

  const userId = req.user?.id || 'test-user-' + Date.now(); // Fallback for testing
  const { 
    nonce, 
    amount, 
    currency = 'USD', 
    musicId,
    songName,
    licenseType,
    licenseId,
    cardholderName,
    postalCode
  } = req.body;

  console.log('Extracted variables:', { nonce: nonce?.substring(0, 10) + '...', amount, currency, musicId, songName });

  // Basic validation
  if (!nonce || !amount || !musicId) {
    console.error('Missing required fields:', { nonce: !!nonce, amount: !!amount, musicId: !!musicId });
    throw new ApiError(httpStatus.BAD_REQUEST, 'nonce, amount, and musicId are required');
  }

  // Environment validation
  console.log('Checking environment variables...');
  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
    console.error('Missing Square environment variables:', {
      hasAccessToken: !!process.env.SQUARE_ACCESS_TOKEN,
      hasLocationId: !!process.env.SQUARE_LOCATION_ID
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Square configuration missing');
  }

  console.log('Environment validation passed');

  try {
    console.log('Attempting to import Square SDK...');
  const { SquareClient, SquareEnvironment } = require('square');
    console.log('Square SDK imported successfully');
    
  const squareEnvironment = process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox;
    
    console.log('Creating Square client...');
  const client = new SquareClient({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: squareEnvironment
    });
    
  const paymentsApi = client.payments;
    console.log('Square client created successfully');

    // Prepare payment data
    const paymentData = {
      sourceId: nonce,
      idempotencyKey: uuidv4(),
      amount: Math.round(amount),
      currency,
      note: `Music Purchase: ${songName} - ${licenseType || 'License'}`
    };

    console.log('Payment data prepared:', {
      sourceId: paymentData.sourceId?.substring(0, 10) + '...',
      idempotencyKey: paymentData.idempotencyKey,
      amount: paymentData.amount,
      currency: paymentData.currency
    });

    // Validate amount
    if (!Number.isInteger(paymentData.amount) || paymentData.amount <= 0) {
      console.error('Invalid amount:', paymentData.amount);
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid amount: must be positive integer (cents)');
    }

    // Prepare Square request body
    const requestBody = {
      sourceId: paymentData.sourceId,
      idempotencyKey: paymentData.idempotencyKey,
      amountMoney: {
        amount: BigInt(paymentData.amount),
        currency: paymentData.currency
      },
      locationId: process.env.SQUARE_LOCATION_ID
    };

    if (paymentData.note) requestBody.note = paymentData.note;
    if (postalCode) requestBody.billingAddress = { postalCode };

    console.log('Making Square API call...');
  const response = await paymentsApi.create(requestBody);
    const payment = response.result?.payment;

    if (!payment) {
      console.error('No payment object in response:', response);
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Invalid payment response from Square');
    }

    console.log('Payment successful:', {
      id: payment.id,
      status: payment.status,
      amount: payment.amountMoney
    });

    res.status(httpStatus.CREATED).json({
      success: true,
      message: 'Payment processed successfully',
      payment: {
        id: payment.id,
        amount: payment.amountMoney,
        status: payment.status,
        createdAt: payment.createdAt,
        receiptUrl: payment.receiptUrl,
        musicId,
        songName,
        licenseType,
        licenseId
      }
    });

  } catch (error) {
    console.error('=== SQUARE PAYMENT ERROR ===');
    console.error('Error type:', typeof error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', error);
    
    if (error.errors) {
      console.error('Square API errors:', error.errors);
    }

    let errorMessage = 'Payment processing failed';
    let statusCode = httpStatus.INTERNAL_SERVER_ERROR;

    // Check if it's already an ApiError
    if (error.statusCode) {
      throw error;
    }

    // Handle Square API errors
    if (error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
      errorMessage = error.errors.map(err => err.detail || err.code || err.message).join(', ');
      statusCode = httpStatus.BAD_REQUEST;
    } else if (error.message) {
      errorMessage = error.message;
    }

    console.error('Throwing ApiError with message:', errorMessage);
    throw new ApiError(statusCode, errorMessage);
  }
});

module.exports = {
  connectSquare,
  squareCallback,
  getSquareStatus,
  getSquareBalance,
  disconnectSquare,
  updateMerchantInfo,
  createPayment,
  createSimplePayment,
  createMusicPayment,
  getPayment,
  listPayments,
  testSquareConfig,
  testSquareOAuth,
  testSquareBalance,
  debugSquareUsers,
  getSquareLogs,
  getSquareRawData
};
