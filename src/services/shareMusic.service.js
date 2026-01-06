const httpStatus = require('http-status');
const { ShareMusicAsset, ShareMusicCreation, Cart, Sale, UserSpace } = require('../models');
const ApiError = require('../utils/ApiError');
const { ObjectId } = require('mongodb');
const mongoose = require('mongoose');


/**
 * Create a music asset
 * @param {Object} body
 * @returns {Promise<Job>}
 */
const shareAsset = async (body) => {
  // Extract file type from uploadAsset URL if present
  if (body.uploadAsset && body.uploadAsset.includes('.')) {
    const fileExtension = body.uploadAsset.split('.').pop().toLowerCase();
    body.fileType = fileExtension;
  }
  
  return ShareMusicAsset.create(body);
};

/**
 * Get Music Assets by userId
 * @param {string} userId
 * @returns {Promise<User>}
 */
const updateAsset = async (assetId, body) => {
  // Extract file type from uploadAsset URL if present
  if (body.uploadAsset && body.uploadAsset.includes('.')) {
    const fileExtension = body.uploadAsset.split('.').pop().toLowerCase();
    body.fileType = fileExtension;
  }
  
  return ShareMusicAsset.findByIdAndUpdate(assetId,
  { ...body },
  { new: true });
};

/**
 * Get Music Assets by userId
 * @param {string} userId
 * @returns {Promise<User>}
 */
const getAssets = async (createdBy) => {
  return ShareMusicAsset.find({ createdBy });
};

const getAssetsById = async (id, userId) => {
  const asset = await ShareMusicAsset.findById(id);
  if (!asset) return null;

  const userSpace = await UserSpace.findOne({ createdBy: asset.createdBy }).lean();

  const obj = asset.toObject();

  const userName = `${userSpace && userSpace.firstName || ''} ${userSpace && userSpace.lastName || ''}`.trim();
  const creationOccupation = userSpace ? userSpace.creationOccupation || [] : [];
  
  // Check if user has purchased this asset
  let hasPurchased = false;
  let isOwner = false;
  
  if (userId) {
    // Check if user is the owner
    isOwner = userId === asset.createdBy.toString();
    
    // Check if user has purchased this asset (only if not owner)
    if (!isOwner) {
      const { Sale } = require('../models');
      const purchase = await Sale.findOne({ 
        assetId: id, 
        buyerId: userId,
        status: 'completed'
      });
      hasPurchased = !!purchase;
    }
  }
  
  // Create base response object without sensitive fields
  const baseResponse = {
    id: obj._id.toString(),
    // Map database fields to frontend expected fields
    songName: obj.title || '',
    creationOccupation: creationOccupation,
    musicImage: obj.assetImages && obj.assetImages.length > 0 ? obj.assetImages[0] : '',
    commercialUsePrice: obj.commercialLicensePrice || 0,
    personalUsePrice: obj.personalLicensePrice || 0,
    // Additional fields that frontend expects
    musicStyle: obj.category || '',
    musicMood: obj.subcategory || '',
    musicInstrument: obj.softwareTools && obj.softwareTools.length > 0 ? obj.softwareTools.join(', ') : '',
    tags: obj.tags || [],
    myRole: ['Producer'], // Default role for music assets
    singerName: userName || '',
    composerName: userName || '',
    fileSize: obj.fileSize || 0,
    fileType: (() => {
      // If fileType is already set, use it
      if (obj.fileType && obj.fileType.trim()) {
        return obj.fileType;
      }
      // Otherwise, extract from uploadAsset URL for backward compatibility
      if (obj.uploadAsset && obj.uploadAsset.includes('.')) {
        return obj.uploadAsset.split('.').pop().toLowerCase();
      }
      return '';
    })(), // Safe to expose - just the extension
    // Keep original fields for backward compatibility (non-sensitive)
    title: obj.title,
    assetImages: obj.assetImages,
    commercialLicensePrice: obj.commercialLicensePrice,
    personalLicensePrice: obj.personalLicensePrice,
    extendedCommercialPrice: obj.extendedCommercialPrice,
    gameEnginePrice: obj.gameEnginePrice,
    broadcastFilmPrice: obj.broadcastFilmPrice,
    extendedRedistributionPrice: obj.extendedRedistributionPrice,
    educationPrice: obj.educationPrice,
    description: obj.description,
    category: obj.category,
    subcategory: obj.subcategory,
    embeds: obj.embeds,
    additionalInformation: obj.additionalInformation,
    basicParametersText: obj.basicParametersText,
    classificationParametersText: obj.classificationParametersText,
    likes: obj.likes,
    status: obj.status,
    views: obj.views,
    createdBy: obj.createdBy,
    updatedBy: obj.updatedBy,
    comments: obj.comments,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    isFree: obj.isFree,
    softwareTools: obj.softwareTools,
    // User info
    profilePicture: userSpace && userSpace.profilePicture || '',
    hiring: userSpace && userSpace.hiring || '',
    userName: userName,
    // Purchase status flags
    hasPurchased: hasPurchased,
    isOwner: isOwner,
  };

  // Only add sensitive asset URLs if user has legitimate access AND is making an authenticated download request
  // For regular viewing, we never expose URLs even to owners for maximum security
  if ((isOwner || hasPurchased) && false) { // Temporarily disabled for maximum security
    const assetUrl = obj.uploadAsset || '';
    return {
      ...baseResponse,
      music: assetUrl, // Only for authorized users
      audioSrc: assetUrl, // Only for authorized users
      musicAudio: assetUrl, // Only for authorized users
      uploadAsset: assetUrl, // Only for authorized users
    };
  } else {
    // For ALL users (including owners), completely omit these fields for security
    return baseResponse;
  }
};



const getAllAssets = async (userId = null, category = null) => {
  // Build query filter
  let filter = {};
  if (category && category !== 'All') {
    filter.category = category;
  }
  
  console.log('🎵 getAllAssets filter:', filter);
  
  // Fetch latest 30 assets sorted by creation date descending with category filter
  const assets = await ShareMusicAsset.find(filter)
    .limit(30)
    .sort({ createdAt: -1 });
    
  console.log('🎵 Found assets:', assets.length);

  // Collect unique userIds from assets for batch fetching userSpace data
  const userIds = [...new Set(assets.map(asset => asset.createdBy.toString()))];

  // Fetch UserSpace documents for all these users
  const userSpaces = await UserSpace.find({ createdBy: { $in: userIds } }).lean();

  // Create a map for quick lookup
  const userSpaceMap = {};
  userSpaces.forEach(u => {
    userSpaceMap[u.createdBy] = {
      userName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      profilePicture: u.profilePicture || '',
      creationOccupation: u.creationOccupation || [],
    };
  });

  // Format assets with userName and profilePicture from UserSpace
  const formatted = assets.map(asset => {
    const obj = asset.toObject();
    const userInfo = userSpaceMap[obj.createdBy] || { userName: '', profilePicture: '', creationOccupation: [] };

    // For general listing, never expose actual download URLs for security
    // Users must purchase to get access to the actual files
    return {
      id: obj._id.toString(),
      // Map database fields to frontend expected fields
      songName: obj.title || '',
      creationOccupation: userInfo.creationOccupation || [],
      musicImage: obj.assetImages && obj.assetImages.length > 0 ? obj.assetImages[0] : '',
      commercialUsePrice: obj.commercialLicensePrice || 0,
      personalUsePrice: obj.personalLicensePrice || 0,
      // Additional fields that frontend expects
      musicStyle: obj.category || '',
      musicMood: obj.subcategory || '',
      musicInstrument: obj.softwareTools && obj.softwareTools.length > 0 ? obj.softwareTools.join(', ') : '',
      tags: obj.tags || [],
      myRole: ['Producer'], // Default role for music assets
      singerName: userInfo.userName || '',
      composerName: userInfo.userName || '',
      fileSize: obj.fileSize || 0,
      fileType: (() => {
        // If fileType is already set, use it
        if (obj.fileType && obj.fileType.trim()) {
          return obj.fileType;
        }
        // Otherwise, extract from uploadAsset URL for backward compatibility
        if (obj.uploadAsset && obj.uploadAsset.includes('.')) {
          return obj.uploadAsset.split('.').pop().toLowerCase();
        }
        return '';
      })(), // Safe to expose - just the extension
      // Keep original fields for backward compatibility (non-sensitive)
      title: obj.title,
      assetImages: obj.assetImages,
      commercialLicensePrice: obj.commercialLicensePrice,
      personalLicensePrice: obj.personalLicensePrice,
      extendedCommercialPrice: obj.extendedCommercialPrice,
      gameEnginePrice: obj.gameEnginePrice,
      broadcastFilmPrice: obj.broadcastFilmPrice,
      extendedRedistributionPrice: obj.extendedRedistributionPrice,
      educationPrice: obj.educationPrice,
      description: obj.description,
      category: obj.category,
      subcategory: obj.subcategory,
      embeds: obj.embeds,
      additionalInformation: obj.additionalInformation,
      basicParametersText: obj.basicParametersText,
      classificationParametersText: obj.classificationParametersText,
      likes: obj.likes,
      status: obj.status,
      views: obj.views,
      createdBy: obj.createdBy,
      updatedBy: obj.updatedBy,
      comments: obj.comments,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      isFree: obj.isFree,
      softwareTools: obj.softwareTools,
      // User info
      userName: userInfo.userName,
      profilePicture: userInfo.profilePicture,
      // NOTE: music, audioSrc, musicAudio, uploadAsset fields are completely omitted for security
    };
  });

  return formatted;
};

const getMyAssets = async (userId) => {
  // Fetch assets created by userId
  const assets = await ShareMusicAsset.find({ createdBy: userId })
    .limit(30)
    .sort({ createdAt: -1 });

  // Fetch userSpace for this user only
  const userSpace = await UserSpace.findOne({ createdBy: userId }).lean();

  const userName = userSpace ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim() : '';
  const profilePicture = userSpace && userSpace.profilePicture || '';
  const creationOccupation = userSpace ? userSpace.creationOccupation || [] : [];

  // Format assets with userName and profilePicture from userSpace
  const formatted = assets.map(asset => {
    const obj = asset.toObject();
    
    // For maximum security, never expose download URLs in any API response
    // Download access should be handled through a separate secure endpoint
    
    return {
      id: obj._id.toString(),
      // Map database fields to frontend expected fields
      songName: obj.title || '',
      creationOccupation: creationOccupation,
      musicImage: obj.assetImages && obj.assetImages.length > 0 ? obj.assetImages[0] : '',
      commercialUsePrice: obj.commercialLicensePrice || 0,
      personalUsePrice: obj.personalLicensePrice || 0,
      // Additional fields that frontend expects
      musicStyle: obj.category || '',
      musicMood: obj.subcategory || '',
      musicInstrument: obj.softwareTools && obj.softwareTools.length > 0 ? obj.softwareTools.join(', ') : '',
      tags: obj.tags || [],
      myRole: ['Producer'], // Default role for music assets
      singerName: userName || '',
      composerName: userName || '',
      fileSize: obj.fileSize || 0,
      fileType: (() => {
        // If fileType is already set, use it
        if (obj.fileType && obj.fileType.trim()) {
          return obj.fileType;
        }
        // Otherwise, extract from uploadAsset URL for backward compatibility
        if (obj.uploadAsset && obj.uploadAsset.includes('.')) {
          return obj.uploadAsset.split('.').pop().toLowerCase();
        }
        return '';
      })(), // Safe to expose - just the extension
      // Keep original fields for backward compatibility (non-sensitive)
      title: obj.title,
      assetImages: obj.assetImages,
      commercialLicensePrice: obj.commercialLicensePrice,
      personalLicensePrice: obj.personalLicensePrice,
      extendedCommercialPrice: obj.extendedCommercialPrice,
      gameEnginePrice: obj.gameEnginePrice,
      broadcastFilmPrice: obj.broadcastFilmPrice,
      extendedRedistributionPrice: obj.extendedRedistributionPrice,
      educationPrice: obj.educationPrice,
      description: obj.description,
      category: obj.category,
      subcategory: obj.subcategory,
      embeds: obj.embeds,
      additionalInformation: obj.additionalInformation,
      basicParametersText: obj.basicParametersText,
      classificationParametersText: obj.classificationParametersText,
      likes: obj.likes,
      status: obj.status,
      views: obj.views,
      createdBy: obj.createdBy,
      updatedBy: obj.updatedBy,
      comments: obj.comments,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      isFree: obj.isFree,
      softwareTools: obj.softwareTools,
      // User info
      userName,
      profilePicture,
      // Owner flags
      isOwner: true,
      hasPurchased: false, // Not applicable for own assets
      // NOTE: music, audioSrc, musicAudio, uploadAsset fields completely omitted for maximum security
    };
  });

  return formatted;
};





/**
 * Create a music creation
 * @param {Object} body
 * @returns {Promise<Job>}
 */
const shareCreation = async (body) => {
  return ShareMusicCreation.create(body);
};

/**
 * Get Music Assets by userId
 * @param {string} userId
 * @returns {Promise<User>}
 */
const getCreation = async (createdBy) => {
  // Fetch creations created by the user
  const creations = await ShareMusicCreation.find({ createdBy })
    .limit(30)
    .sort({ createdAt: -1 });

  // Fetch userSpace for this user
  const userSpace = await UserSpace.findOne({ createdBy }).lean();

  const userName = userSpace ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim() : '';
  const profilePicture = userSpace && userSpace.profilePicture || '';
  const creationOccupation = userSpace ? userSpace.creationOccupation || [] : [];

  // Format creations with user information
  const formatted = creations.map(creation => {
    const obj = creation.toObject();
    return {
      ...obj,
      id: obj._id.toString(),
      // Map database fields to frontend expected fields
      songName: obj.title || '',
      musicImage: obj.workImages && obj.workImages.length > 0 ? obj.workImages[0] : '',
      // Additional fields that frontend expects
      musicStyle: obj.category || '',
      creationOccupation:creationOccupation || '',
      musicMood: obj.subcategory || '',
      musicInstrument: obj.softwareTool && obj.softwareTool.length > 0 ? obj.softwareTool.join(', ') : '',
      tags: obj.tags || [],
      myRole: obj.myRole || ['Creator'],
      singerName: userName || '',
      composerName: userName || '',
      // User info
      userName: userName,
      profilePicture: profilePicture,
      // Work type
      workType: obj.workType || 'design',
    };
  });

  return formatted;
};

const getCreationById = async (id) => {
  const creation = await ShareMusicCreation.findById(id);
  if (!creation) return null;

  const userSpace = await UserSpace.findOne({ createdBy: creation.createdBy }).lean();
  
  const userName = userSpace ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim() : '';
  const profilePicture = userSpace && userSpace.profilePicture || '';

  const obj = creation.toObject();
  console.log("RAW DB DATA - embeds field:", obj.embeds);
  
  return {
    id: obj._id.toString(),
    title: obj.title,
    description: obj.description,
    workImages: obj.workImages || [],
    creationOccupation:obj.creationOccupation || '',
    assetImages: obj.assetImages || [],
    category: obj.category || '',
    subcategory: obj.subcategory || '',
    tags: obj.tags || [],
    softwareTool: obj.softwareTool || [],
    embeds: obj.embeds || '',
    workType: obj.workType || 'design',
    // Map database fields to frontend expected fields
    songName: obj.title || '',
    musicImage: obj.workImages && obj.workImages.length > 0 ? obj.workImages[0] : '',
    // Additional fields that frontend expects
    musicStyle: obj.category || '',
    musicMood: obj.subcategory || '',
    musicInstrument: obj.softwareTool && obj.softwareTool.length > 0 ? obj.softwareTool.join(', ') : '',
    myRole: obj.myRole || ['Creator'],
    singerName: userName || '',
    composerName: userName || '',
    // User info
    userName: userName,
    profilePicture: profilePicture,
    // Include likes array and calculate totalLikes
    likes: obj.likes || [],
    totalLikes: (obj.likes || []).length,
    // Include comments array
    comments: obj.comments || [],
    // Additional metadata
    createdAt: obj.createdAt,
    createdBy: obj.createdBy,
    views: obj.views || 0,
    isLiked: false,
    isCollected: false,
    contributors: obj.contributors || []
  };
};

const getAllCreations = async (userId = null, category = null) => {
  // Build query filter
  let filter = {};
  if (category && category !== 'All') {
    filter.category = category;
  }
  
  console.log('🎨 getAllCreations filter:', filter);
  
  // Fetch latest 30 creations sorted by creation date descending with category filter
  const creations = await ShareMusicCreation.find(filter)
    .limit(30)
    .sort({ createdAt: -1 });
    
  console.log('🎨 Found creations:', creations.length);

  // Get blockedUsers if userId is provided
  let blockedUsers = [];
  if (userId) {
    const { User } = require('../models');
    const user = await User.findById(userId).select('blockedUsers');
    if (user && Array.isArray(user.blockedUsers)) {
      blockedUsers = user.blockedUsers.map(id => id.toString());
    }
  }

  // Collect unique userIds from creations for batch fetching userSpace data
  const userIds = [...new Set(creations.map(creation => creation.createdBy))];

  // Fetch UserSpace documents for all these users
  const userSpaces = await UserSpace.find({ createdBy: { $in: userIds } }).lean();

  // Create a map for quick lookup
  const userSpaceMap = {};
  userSpaces.forEach(u => {
    userSpaceMap[u.createdBy] = {
      userName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      profilePicture: u.profilePicture || '',
      creationOccupation: u.creationOccupation || [],
      userCountry: (u.address || '').split(',')[0] || ''
    };
  });

  // Format creations with user information
  const formatted = creations
    .filter(creation => !blockedUsers.includes(creation.createdBy))
    .map(creation => {
      const obj = creation.toObject();
      const userInfo = userSpaceMap[obj.createdBy] || { userName: '', profilePicture: '', creationOccupation: [] };
      
      let isLiked = false;
      if (userId) {
        isLiked = (obj.likes || []).some(id => id.toString() === userId.toString());
      }

      return {
        id: obj._id.toString(),
        title: obj.title,
        description: obj.description,
        workImages: obj.workImages || [],
        assetImages: obj.assetImages || [],
        creationOccupation: userInfo.creationOccupation || [],
        category: obj.category || '',
        subcategory: obj.subcategory || '',
        tags: obj.tags || [],
        softwareTool: obj.softwareTool || [],
        embeds: obj.embeds || '',
        workType: obj.workType || 'design',
        createdAt: obj.createdAt,
        createdBy: obj.createdBy,
        views: obj.views || 0,
        contributors: obj.contributors || [],
        // Map database fields to frontend expected fields
        songName: obj.title || '',
        musicImage: obj.workImages && obj.workImages.length > 0 ? obj.workImages[0] : '',
        // Additional fields that frontend expects
        musicStyle: obj.category || '',
        musicMood: obj.subcategory || '',
        musicInstrument: obj.softwareTool && obj.softwareTool.length > 0 ? obj.softwareTool.join(', ') : '',
        myRole: obj.myRole || ['Creator'],
        singerName: userInfo.userName || '',
        composerName: userInfo.userName || '',
        // User info
        userName: userInfo.userName,
        profilePicture: userInfo.profilePicture,
        userCountry: userInfo.userCountry || '',
        isLiked,
        isCreation: true, // Flag to identify this as a creation
        // Include likes array and calculate totalLikes
        likes: obj.likes || [],
        totalLikes: (obj.likes || []).length,
        // Include comments array
        comments: obj.comments || []
      };
    });

  return formatted;
};

const addToCart = async (userId, assetId) => {
  try {
    let cart = await Cart.findOne({ createdBy: userId });

    if (!cart) {
      cart = new Cart({
        createdBy: userId,
        cartItems: [{ assetId, quantity: 1 }]
      });
    } else {
      const existingItem = cart.cartItems.find(item => item.assetId.toString() === assetId);

      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        cart.cartItems.push({ assetId, quantity: 1 });
      }
    }

    await cart.save();

    let CartData = await Cart.findById(cart._id)
      .populate({
        path: 'cartItems.assetId',
        select: 'songName commercialUsePrice musicImage createdBy',
        populate: {
          path: 'createdBy',
          select: 'name _id'
        }
      });

    const data = CartData.cartItems.map((item) => ({
      ...item.toObject(),
      assetId: {
        ...item.assetId.toObject(),
        creatorName: item.assetId.createdBy && item.assetId.createdBy.name || 'Unknown',
        ownerId: item.assetId.createdBy && (item.assetId.createdBy._id || item.assetId.createdBy.id)
      }
    }))

    // console.log(data, 'data')

    return data;
  } catch (error) {
    console.error("Error adding to cart:", error);
    throw new Error("Could not add asset to cart");
  }
};



const getCart = async (userId) => {
  try {
    const cart = await Cart.findOne({ createdBy: userId })

    if (!cart) {
      return { success: false, message: "Cart is empty", cart: [] };
    }
    
    let CartData = await Cart.findById(cart._id)
      .populate({
        path: 'cartItems.assetId',
        select: 'songName commercialUsePrice musicImage createdBy',
        populate: {
          path: 'createdBy',
          select: 'name _id'
        }
      });

    const data = CartData.cartItems.map((item) => ({
      ...item.toObject(),
      assetId: {
        ...item.assetId.toObject(),
        creatorName: item.assetId.createdBy && item.assetId.createdBy.name || 'Unknown',
        ownerId: item.assetId.createdBy && (item.assetId.createdBy._id || item.assetId.createdBy.id)
      }
    }))


    return data;
  } catch (error) {
    console.error("Error fetching cart:", error);
    throw new Error("Could not retrieve cart");
  }
};



const deleteCart = async (userId, assetId) => {
  try {
    const cart = await Cart.findOne({ createdBy: userId });

    if (!cart) {
      return { success: false, message: "Cart not found" };
    }

    // Remove the specific item from cartItems array
    cart.cartItems = cart.cartItems.filter(
      item => item.assetId.toString() !== assetId
    );

    // Save the updated cart
    await cart.save();

    return {
      success: true,
      message: "Item removed from cart successfully",
      updatedCart: cart
    };
  } catch (error) {
    console.error("Error removing item from cart:", error);
    throw new Error("Could not remove item from cart");
  }
};

const addSale = async (saleData, userId) => {
  try {
    const { Purchase, User } = require('../models');
    const { calculateSellerPayout } = require('../utils/vatCalculator');

    const sale = await Sale.create({
      assetId: new mongoose.Types.ObjectId(saleData.assetId),
      OwnerId: new mongoose.Types.ObjectId(saleData.OwnerId),
      buyerId: new mongoose.Types.ObjectId(userId), // Add buyer ID for proper tracking
      assetPrice: saleData.assetPrice,
      buyer: saleData.buyer,
      assetTitle: saleData.assetTitle,
      quantity: saleData.quantity,
      totalAmount: saleData.assetPrice * saleData.quantity, // Calculate total amount
      creatorName: saleData.creatorName,
      status: 'completed', // Set default status
      paymentMethod: saleData.paymentMethod || 'paypal',
      paymentId: saleData.paymentId,
    });

    await sale.save();

    if (!sale) {
      return { success: false, message: "Sale not created" };
    }

    // Calculate seller payout with new fee structure: 60% - 2.9% Stripe fee - 1.33% VAT
    const sellingPrice = saleData.assetPrice * saleData.quantity;
    const sellerPayoutBreakdown = calculateSellerPayout(sellingPrice);
    
    // Update seller balance with new payout structure
    try {
      const seller = await User.findById(saleData.OwnerId);
      
      if (seller) {
        const netSellerPayout = sellerPayoutBreakdown.netSellerPayout;
        
        await User.findByIdAndUpdate(saleData.OwnerId, { 
          $inc: { balance: netSellerPayout } 
        });
        
        console.log(`✅ MUSIC SALE: Added $${netSellerPayout.toFixed(2)} to seller ${seller.email || seller.name}`);
      } else {
        console.error('❌ Seller not found for ID:', saleData.OwnerId);
      }
    } catch (balanceError) {
      console.error('❌ Error updating seller balance:', balanceError);
      // Don't fail the sale if balance update fails, but log the error
    }

    // Also create a Purchase record for the profile purchases page
    try {
      const purchase = await Purchase.create({
        user: userId,
        music: saleData.assetId,
        amount: saleData.assetPrice * saleData.quantity,
        currency: 'USD',
        paymentMethod: saleData.paymentMethod || 'stripe',
        licenseType: 'Commercial Use',
        status: 'completed',
        transactionId: `${saleData.paymentId}_${saleData.assetId}_${Date.now()}`, // Make unique for each item
        metadata: {
          source: 'cart_checkout',
          originalSaleId: sale._id,
          stripePaymentIntentId: saleData.paymentId // Store original payment intent ID
        }
      });
      console.log('Purchase record created:', purchase._id);
    } catch (purchaseError) {
      console.log('Error creating purchase record:', purchaseError);
      // Don't fail the sale if purchase record creation fails
    }

    // Clear the cart after successful sale
    try {
      const cart = await Cart.findOne({ createdBy: userId });
      if (cart) {
        cart.cartItems = [];
        await cart.save();
        console.log('Cart cleared successfully');
      }
    } catch (cartError) {
      console.log('Error clearing cart:', cartError);
      // Don't fail the sale if cart clearing fails
    }

    return { success: true, sales: [sale] };
  } catch (error) {
    console.log('Error in addSale:', error);
    return { success: false, message: error.message, error: error };
  }
};

const getSales = async (userId) => {
  try {
    const sales = await Sale.find({ OwnerId: userId });

    if (!sales || sales.length == 0) {
      return { success: false, message: "No sales found" };
    }

    return { success: true, sales };
  } catch (error) {
    console.error("Error fetching sales:", error);
    throw new Error("Could not fetch sales");
  }
};

const getPurchases = async (userId) => {
  try {
    const sales = await Sale.find({ buyerId: userId })
      .populate({
        path: 'assetId',
        select: 'songName musicImage music personalUsePrice commercialUsePrice myRole musicUsage musicStyle',
      })
      .populate({
        path: 'OwnerId',
        select: 'name email',
      })
      .sort({ createdAt: -1 });

    if (!sales || sales.length == 0) {
      return { success: false, message: "No purchases found" };
    }

    return { success: true, purchases: sales };
  } catch (error) {
    console.error("Error fetching purchases:", error);
    throw new Error("Could not fetch purchases");
  }
};

module.exports = {
  shareAsset,
  updateAsset,
  getAssets,
  getAssetsById,
  shareCreation,
  getCreation,
  getCreationById,
  getAllCreations,
  addToCart,
  getCart,
  deleteCart,
  addSale,
  getSales,
  getAllAssets,
  getPurchases,
  getMyAssets
};
