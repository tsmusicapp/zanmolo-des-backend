const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { purchaseService, stripeService } = require('../services');
const Purchase = require('../models/purchase.model');
const ShareMusicAsset = require('../models/shareMusicAsset.model');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const logger = require('../config/logger');

/**
 * Create new purchase record with Stripe payment
 */
const createStripePurchase = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    musicId,
    songName,
    amount,
    currency = 'USD',
    paymentMethodId,
    stripePaymentIntentId,
    licenseType,
    licenseId,
    savePaymentMethod = false,
    billingAddress,
  } = req.body;

  if (!musicId || amount === undefined || !licenseType || !stripePaymentIntentId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required fields: musicId, amount, licenseType, stripePaymentIntentId');
  }

  // Verify music exists
  const music = await ShareMusicAsset.findById(musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Music asset not found');
  }

  // Verify payment intent was successful
  const paymentIntent = await stripeService.getPaymentIntent(stripePaymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment not completed');
  }

  // Verify payment amount matches
  const paymentAmountInCents = Math.round(amount * 100);
  if (paymentIntent.amount !== paymentAmountInCents) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount mismatch');
  }

  const session = await mongoose.startSession();
  let createdPurchase = null;
  let existingPurchase = null;

  try {
    await session.withTransaction(async () => {
      // Check existing purchase
      existingPurchase = await Purchase.findOne({
        user: userId,
        music: musicId,
        licenseId: licenseId,
        status: 'completed'
      }).session(session);

      if (existingPurchase) {
        return;
      }

      const purchaseData = {
        user: userId,
        music: musicId,
        amount,
        currency,
        paymentMethod: 'stripe',
        stripePaymentIntentId,
        stripePaymentMethodId: paymentMethodId,
        licenseType,
        status: 'completed', // Stripe payment already succeeded
        metadata: {
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          stripePayment: true,
          paymentIntentStatus: paymentIntent.status,
        }
      };

      if (licenseId) purchaseData.licenseId = licenseId;
      if (billingAddress) purchaseData.metadata.billingAddress = billingAddress;

      // Save payment method if requested
      if (savePaymentMethod && paymentMethodId) {
        const user = await User.findById(userId).session(session);
        if (user) {
          // Get payment method details from Stripe
          const customer = await stripeService.getStripeCustomer(userId);
          const paymentMethods = await stripeService.getPaymentMethods(customer.id);
          const savedMethod = paymentMethods.find(pm => pm.id === paymentMethodId);
          
          if (savedMethod) {
            // Add to user's saved payment methods
            const methodInfo = {
              id: savedMethod.id,
              brand: savedMethod.card.brand,
              last4: savedMethod.card.last4,
              expMonth: savedMethod.card.exp_month,
              expYear: savedMethod.card.exp_year,
              isDefault: user.stripePaymentMethods.length === 0,
              createdAt: new Date()
            };
            
            user.stripePaymentMethods = user.stripePaymentMethods || [];
            // Remove existing method with same ID if any
            user.stripePaymentMethods = user.stripePaymentMethods.filter(pm => pm.id !== paymentMethodId);
            user.stripePaymentMethods.push(methodInfo);
            
            await user.save({ session });
          }
        }
      }

      // Create purchase
      createdPurchase = await Purchase.create([purchaseData], { session });
      if (Array.isArray(createdPurchase)) createdPurchase = createdPurchase[0];
    });
  } finally {
    session.endSession();
  }

  if (existingPurchase) {
    return res.json({
      success: true,
      message: 'Already purchased',
      purchase: existingPurchase,
      alreadyOwned: true
    });
  }

  if (!createdPurchase) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create purchase');
  }

  // Populate the response
  await createdPurchase.populate([
    { path: 'music', select: 'songName commercialUsePrice personalUsePrice musicImage music createdBy', populate: { path: 'createdBy', select: 'name email' } },
    { path: 'user', select: 'name email' }
  ]);

  // Generate download URL
  const downloadUrl = `${process.env.BASE_URL || 'http://localhost:5052'}/v1/purchases/history/${createdPurchase._id}/download`;

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Stripe purchase completed successfully',
    purchase: createdPurchase,
    downloadUrl: downloadUrl,
    transactionId: createdPurchase.transactionId,
    redirect: {
      url: '/purchase-success',
      params: {
        purchaseId: createdPurchase._id,
        songName: music.songName || songName,
        artist: music.createdBy?.name || 'Unknown Artist',
        composer: music.createdBy?.name || 'Unknown Composer',
        price: amount,
        licenseType,
        purchaseDate: createdPurchase.createdAt,
        downloadUrl: downloadUrl,
        musicFile: music.music,
        musicImage: music.musicImage,
        transactionId: createdPurchase.transactionId,
        paymentMethod: 'stripe'
      }
    }
  });
});

/**
 * Create new purchase record (skip Square integration, direct to database)
 */
const createPurchase = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    musicId,
    songName,
    amount,
    currency = 'USD',
    paymentMethod = 'wallet', // Default to wallet payment
    squarePaymentId,
    licenseType,
    licenseId,
    status = 'completed',
    billingAddress,
    savePaymentInfo,
    // Bank/Card information for Stripe payment
    cardData
  } = req.body;

  if (!musicId || amount === undefined || !licenseType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required fields: musicId, amount, licenseType');
  }

  // Verify music exists
  const music = await ShareMusicAsset.findById(musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Music asset not found');
  }

  // Use a mongoose transaction to make debit + purchase creation atomic
  const session = await mongoose.startSession();
  let createdPurchase = null;
  let existingPurchase = null;
  let stripePaymentIntentId = null;
  
  try {
    await session.withTransaction(async () => {
      // Re-check existing purchase inside transaction to avoid race
      existingPurchase = await Purchase.findOne({
        user: userId,
        music: musicId,
        licenseId: licenseId,
        status: 'completed'
      }).session(session);

      if (existingPurchase) {
        // nothing to do inside transaction, will return after
        return;
      }

      const purchaseData = {
        user: userId,
        music: musicId,
        amount,
        currency,
        paymentMethod,
        licenseType,
        status: 'pending', // Start with pending, will update after payment
        metadata: {
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
        }
      };

      if (squarePaymentId) purchaseData.squarePaymentId = squarePaymentId;
      if (licenseId) purchaseData.licenseId = licenseId;
      if (billingAddress) purchaseData.metadata.billingAddress = billingAddress;

      // Load user and perform payment processing
      const user = await User.findById(userId).session(session);
      if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

      // Ensure numeric balance
      if (typeof user.balance !== 'number') user.balance = 0;

      // Process payment based on payment method
      if (paymentMethod === 'wallet') {
        // Wallet payment - check and deduct balance
        if (user.balance < amount) {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient wallet balance');
        }
        const pre = Number(user.balance || 0);
        const post = Number((pre - amount).toFixed(2));
        user.balance = post;
        purchaseData.metadata.preBalance = pre;
        purchaseData.metadata.postBalance = post;
        purchaseData.metadata.walletPayment = true;
        purchaseData.status = 'completed';
      } else if (paymentMethod === 'stripe') {
        // Process Stripe payment with payment method ID (tokenized card)
        const requestBody = req.body;
        const stripePaymentMethodId = requestBody.stripePaymentMethodId;
        let stripePaymentIntentId = requestBody.stripePaymentIntentId;
        
        if (!stripePaymentMethodId && !stripePaymentIntentId) {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Stripe payment method ID or payment intent ID is required for Stripe payments');
        }

        try {
          let paymentIntent;
          
          if (stripePaymentIntentId) {
            // If payment intent ID is provided, verify it
            paymentIntent = await stripeService.getPaymentIntent(stripePaymentIntentId);
            if (paymentIntent.status !== 'succeeded') {
              throw new ApiError(httpStatus.BAD_REQUEST, 'Stripe payment not completed successfully');
            }
            
            // Verify payment amount matches
            const paymentAmountInCents = Math.round(amount * 100);
            if (paymentIntent.amount !== paymentAmountInCents) {
              throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount mismatch');
            }
          } else {
            // Get or create Stripe customer
            let stripeCustomer = await stripeService.getStripeCustomer(userId);
            
            // For test payment method, create a valid payment intent
            let finalPaymentMethodId = stripePaymentMethodId;
            
            // If using test payment method pm_card_visa, create a new one and attach to customer
            if (stripePaymentMethodId === 'pm_card_visa' || stripePaymentMethodId.startsWith('pm_card_')) {
              logger.info('Using test payment method, creating new payment method for customer');
              
              // Create a new payment method for the customer
              const newPaymentMethod = await stripeService.createPaymentMethod({
                type: 'card',
                card: {
                  token: 'tok_visa' // Use Stripe test token
                }
              });
              
              // Attach to customer
              await stripeService.attachPaymentMethod(newPaymentMethod.id, stripeCustomer.id);
              finalPaymentMethodId = newPaymentMethod.id;
            }
            
            // Create payment intent
            const paymentIntentData = {
              amount: amount, // stripeService will convert to cents
              currency: currency.toLowerCase(),
              customerId: stripeCustomer.id,
              paymentMethodId: finalPaymentMethodId,
              description: `Purchase of ${songName}`,
              metadata: {
                userId: userId.toString(),
                musicId: musicId.toString(),
                licenseType: licenseType,
                songName: songName,
              },
            };
            
            paymentIntent = await stripeService.createPaymentIntent(paymentIntentData);
          }

          if (paymentIntent.status === 'succeeded') {
            // Payment successful
            stripePaymentIntentId = paymentIntent.id;
            purchaseData.stripePaymentIntentId = paymentIntent.id;
            if (stripePaymentMethodId) purchaseData.stripePaymentMethodId = stripePaymentMethodId;
            purchaseData.metadata.stripePayment = true;
            purchaseData.metadata.paymentIntentStatus = paymentIntent.status;
            purchaseData.status = 'completed';

            // Save payment method if requested
            if (savePaymentInfo && stripePaymentMethodId) {
              const customer = await stripeService.getStripeCustomer(userId);
              const paymentMethods = await stripeService.getPaymentMethods(customer.id);
              const savedMethod = paymentMethods.find(pm => pm.id === stripePaymentMethodId);
              
              if (savedMethod) {
                const methodInfo = {
                  id: savedMethod.id,
                  brand: savedMethod.card.brand,
                  last4: savedMethod.card.last4,
                  expMonth: savedMethod.card.exp_month,
                  expYear: savedMethod.card.exp_year,
                  isDefault: (user.stripePaymentMethods || []).length === 0,
                  createdAt: new Date()
                };
                
                user.stripePaymentMethods = user.stripePaymentMethods || [];
                user.stripePaymentMethods = user.stripePaymentMethods.filter(pm => pm.id !== stripePaymentMethodId);
                user.stripePaymentMethods.push(methodInfo);
              }
            }
          } else if (paymentIntent.status === 'requires_action') {
            // 3D Secure or other authentication required
            throw new Error('This transaction requires additional authentication. Please use frontend Stripe Elements for 3D Secure.');
          } else {
            throw new ApiError(httpStatus.BAD_REQUEST, `Stripe payment failed: ${paymentIntent.status}`);
          }
        } catch (stripeError) {
          console.error('Stripe payment error:', stripeError);
          throw new ApiError(httpStatus.BAD_REQUEST, `Payment processing failed: ${stripeError.message}`);
        }
      } else if (paymentMethod === 'square') {
        // Square payment processing (existing logic can be added here)
        purchaseData.metadata.squarePayment = true;
        purchaseData.status = 'completed';
        if (squarePaymentId) {
          purchaseData.squarePaymentId = squarePaymentId;
        }
      }

      // Save billing info if requested
      if (savePaymentInfo && billingAddress) {
        user.billingInfo = billingAddress;
      }

      // Save user changes inside the transaction
      await user.save({ session });

      // Create purchase inside the transaction
      createdPurchase = await Purchase.create([purchaseData], { session });
      // Purchase.create with array returns array
      if (Array.isArray(createdPurchase)) createdPurchase = createdPurchase[0];
    });
  } finally {
    session.endSession();
  }

  if (existingPurchase) {
    return res.json({
      success: true,
      message: 'Already purchased',
      purchase: existingPurchase,
      alreadyOwned: true
    });
  }

  if (!createdPurchase) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create purchase');
  }

  // Populate the response outside the transaction
  await createdPurchase.populate([
    { path: 'music', select: 'songName commercialUsePrice personalUsePrice musicImage music createdBy', populate: { path: 'createdBy', select: 'name email' } },
    { path: 'user', select: 'name email' }
  ]);

  // Fetch updated balance to return (unchanged for demo)
  let updatedBalance = null;
  if (paymentMethod === 'wallet') {
    const userAfter = await User.findById(userId).select('balance');
    updatedBalance = typeof userAfter.balance === 'number' ? userAfter.balance : 0;
  }

  // Generate download URL for the purchased music
  const downloadUrl = `${process.env.BASE_URL || 'http://localhost:5052'}/v1/purchases/history/${createdPurchase._id}/download`;

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Purchase completed successfully',
    purchase: createdPurchase,
    balance: updatedBalance,
    downloadUrl: downloadUrl,
    transactionId: createdPurchase.transactionId,
    // Additional data for redirect to success page
    redirect: {
      url: '/purchase-success',
      params: {
        purchaseId: createdPurchase._id,
        songName: music.songName || songName,
        artist: music.createdBy?.name || 'Unknown Artist',
        composer: music.createdBy?.name || 'Unknown Composer',
        price: amount,
        licenseType,
        purchaseDate: createdPurchase.createdAt,
        downloadUrl: downloadUrl,
        musicFile: music.music, // Add musicFile to redirect params
        musicImage: music.musicImage,
        transactionId: createdPurchase.transactionId
      }
    }
  });
});

/**
 * Get purchase history with search, filters, and pagination
 */
const getPurchaseHistory = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const filter = pick(req.query, ['search', 'status', 'dateFrom', 'dateTo', 'minAmount', 'maxAmount']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  console.log('getPurchaseHistory Controller - userId:', userId);
  console.log('getPurchaseHistory Controller - filter:', filter);
  console.log('getPurchaseHistory Controller - options:', options);

  // Validasi user ID
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }
  
  const result = await purchaseService.getPurchaseHistory(userId, filter, options);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Purchase history retrieved successfully',
    data: result
  });
});

/**
 * Get detailed purchase information
 */
const getPurchaseDetails = catchAsync(async (req, res) => {
  const { purchaseId } = req.params;
  const userId = req.user.id;
  
  const result = await purchaseService.getPurchaseDetails(purchaseId, userId);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Purchase details retrieved successfully',
    data: result
  });
});

/**
 * Generate secure download URL for purchased asset
 */
const generateDownloadUrl = catchAsync(async (req, res) => {
  const { purchaseId } = req.params;
  const userId = req.user.id;
  
  const result = await purchaseService.generateDownloadUrl(purchaseId, userId);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Download URL generated successfully',
    data: result
  });
});

/**
 * Download purchased file (actual file download)
 */
const downloadPurchasedFile = catchAsync(async (req, res) => {
  const { purchaseId } = req.params;
  const userId = req.user.id;
  
  // Verify purchase exists and belongs to user
  const purchase = await Purchase.findOne({
    _id: purchaseId,
    user: userId,
    status: 'completed'
  }).populate('music', 'songName musicImage music');
  
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found or not authorized');
  }
  
  // For demo purposes, return a success response with file info
  // In production, you would stream the actual file
  const musicFile = purchase.music.music || '/demo/sample-music.mp3';
  const filename = `${purchase.music.songName || 'music'}.mp3`
    .replace(/[^a-z0-9.-]/gi, '_')
    .toLowerCase();
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Download ready',
    data: {
      purchaseId: purchase._id,
      filename: filename,
      downloadUrl: `${process.env.BASE_URL || 'http://localhost:5052'}${musicFile}`,
      expiresIn: 3600, // 1 hour
      purchaseDate: purchase.createdAt,
      licenseType: purchase.licenseType
    }
  });
});

/**
 * Simple download endpoint for direct file download
 */
const downloadFile = catchAsync(async (req, res) => {
  const { purchaseId } = req.params;
  const userId = req.user.id;
  
  // Verify purchase
  const purchase = await Purchase.findOne({
    _id: purchaseId,
    user: userId,
    status: 'completed'
  }).populate('music', 'songName musicImage music');
  
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }

  // For demo - simulate file download
  // In production, you would stream the actual file using fs.createReadStream() or S3 stream
  const filename = `${purchase.music.songName || 'music'}.mp3`.replace(/[^a-z0-9.-]/gi, '_');
  
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'audio/mpeg');
  
  // Return success for now - in production stream the file
  res.status(httpStatus.OK).json({
    success: true,
    message: 'File download would start here',
    filename: filename,
    purchaseId: purchase._id
  });
});

/**
 * Get sales data for music creators
 */
const getSalesData = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const filter = pick(req.query, ['search', 'status', 'dateFrom', 'dateTo', 'minAmount', 'maxAmount']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  const result = await purchaseService.getSalesData(userId, filter, options);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Sales data retrieved successfully',
    data: result
  });
});

/**
 * Create gig order
 */
const createGigOrder = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    gigId,
    packageType, // 'basic', 'standard', 'premium'
    extras = [], // array of extra service IDs
    requirements,
    totalAmount,
    deliveryTime
  } = req.body;

  // Validate gig exists and is active
  const { gigService } = require('../services');
  const gig = await gigService.getGigById(gigId);
  
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }
  
  if (gig.status !== 'active' || !gig.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Gig is not available for purchase');
  }

  if (gig.seller.toString() === userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot order your own gig');
  }

  // Validate package exists
  if (!gig.packages[packageType]) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid package type');
  }

  // Calculate expected amount
  let expectedAmount = gig.packages[packageType].price;
  let expectedDeliveryTime = gig.packages[packageType].deliveryTime;
  
  // Add extras cost
  for (const extraId of extras) {
    const extra = gig.gig_extras.find(e => e._id.toString() === extraId);
    if (extra) {
      expectedAmount += extra.price;
      expectedDeliveryTime += extra.additionalTime;
    }
  }

  // Validate amount
  if (Math.abs(totalAmount - expectedAmount) > 0.01) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Amount mismatch. Expected: $${expectedAmount}, Received: $${totalAmount}`);
  }

  // Create order record
  const orderData = {
    buyer: userId,
    seller: gig.seller,
    gig: gigId,
    packageType,
    packageDetails: gig.packages[packageType],
    extras: extras.map(extraId => {
      const extra = gig.gig_extras.find(e => e._id.toString() === extraId);
      return {
        extraId,
        title: extra.title,
        price: extra.price,
        additionalTime: extra.additionalTime
      };
    }),
    requirements: requirements || '',
    totalAmount,
    deliveryTime,
    expectedDeliveryDate: new Date(Date.now() + deliveryTime * 24 * 60 * 60 * 1000),
    status: 'pending_payment',
    type: 'gig_order'
  };

  // For now, create as completed order (later integrate with payment)
  orderData.status = 'active';
  orderData.startTime = new Date();

  const Order = require('../models/order.model');
  const order = await Order.create(orderData);

  // Update gig stats
  await gigService.updateGigStats(gigId, { totalOrders: 1 });

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Gig order created successfully',
    data: order
  });
});

/**
 * Create gig order with Stripe payment
 */
const createStripeGigOrder = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    gigId,
    packageType,
    extras = [],
    requirements,
    totalAmount,
    deliveryTime,
    paymentMethodId,
    savePaymentMethod = false,
    billingAddress
  } = req.body;

  // Validate gig and calculate amount (same logic as createGigOrder)
  const { gigService } = require('../services');
  const gig = await gigService.getGigById(gigId);
  
  if (!gig || gig.status !== 'active' || !gig.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Gig is not available for purchase');
  }

  if (gig.seller.toString() === userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot order your own gig');
  }

  let expectedAmount = gig.packages[packageType].price;
  for (const extraId of extras) {
    const extra = gig.gig_extras.find(e => e._id.toString() === extraId);
    if (extra) expectedAmount += extra.price;
  }

  if (Math.abs(totalAmount - expectedAmount) > 0.01) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Amount mismatch. Expected: $${expectedAmount}`);
  }

  try {
    // Create Stripe payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: Math.round(totalAmount * 100), // Convert to cents
      currency: 'USD',
      paymentMethodId,
      customerId: req.user.stripeCustomerId,
      metadata: {
        type: 'gig_order',
        gigId,
        packageType,
        buyerId: userId,
        sellerId: gig.seller.toString()
      }
    });

    // Create order record
    const orderData = {
      buyer: userId,
      seller: gig.seller,
      gig: gigId,
      packageType,
      packageDetails: gig.packages[packageType],
      extras: extras.map(extraId => {
        const extra = gig.gig_extras.find(e => e._id.toString() === extraId);
        return {
          extraId,
          title: extra.title,
          price: extra.price,
          additionalTime: extra.additionalTime
        };
      }),
      requirements: requirements || '',
      totalAmount,
      deliveryTime,
      expectedDeliveryDate: new Date(Date.now() + deliveryTime * 24 * 60 * 60 * 1000),
      status: 'pending_payment',
      type: 'gig_order',
      paymentDetails: {
        method: 'stripe',
        paymentIntentId: paymentIntent.id,
        amount: totalAmount,
        currency: 'USD'
      }
    };

    const Order = require('../models/order.model');
    const order = await Order.create(orderData);

    res.status(httpStatus.CREATED).json({
      success: true,
      message: 'Gig order created with payment intent',
      data: {
        order,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          status: paymentIntent.status
        }
      }
    });

  } catch (error) {
    logger.error('Stripe gig order creation failed:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Payment processing failed');
  }
});

module.exports = {
  createPurchase,
  createStripePurchase,
  createGigOrder,
  createStripeGigOrder,
  getPurchaseHistory,
  getPurchaseDetails,
  generateDownloadUrl,
  downloadPurchasedFile,
  downloadFile,
  getSalesData
};
