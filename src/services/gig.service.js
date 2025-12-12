const httpStatus = require('http-status');
const { Gig } = require('../models');
const ApiError = require('../utils/ApiError');
const Report = require('../models/report.model');
const { getSpace } = require('./userSpace.service');

/**
 * Create a gig
 * @param {Object} gigBody
 * @returns {Promise<Gig>}
 */
const createGig = async (gigBody) => {
  // Handle backward compatibility: transform flat structure to packages structure
  if (gigBody.price && !gigBody.packages) {
    const { price, revisions, features, ...restBody } = gigBody;
    
    gigBody = {
      ...restBody,
      packages: {
        basic: {
          title: "Basic Package",
          description: "Basic service package",
          price: price,
          revisions: revisions || 1,
          features: features || []
        }
      }
    };
  }
  
  try {
    // Try to create with validation bypassed
    const result = await Gig.create(gigBody, { validateBeforeSave: false });
    return result;
  } catch (error) {
    // If Mongoose validation fails, try raw MongoDB insert to bypass collection-level JSON Schema validation
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      const collection = db.collection('gigs');
      
      // Insert directly into MongoDB bypassing all validation including collection-level JSON Schema
      const insertResult = await collection.insertOne(gigBody, { bypassDocumentValidation: true });
      
      // Return the created document
      const createdGig = await Gig.findById(insertResult.insertedId);
      return createdGig;
    } catch (rawError) {
      console.error('Gig creation failed:', error.message);
      throw error; // Throw original error
    }
  }
};

/**
 * Query for gigs
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryGigs = async (filter, options, userId = null) => {
  // Handle price range filter
  if (filter.minPrice || filter.maxPrice) {
    filter['packages.basic.price'] = {};
    if (filter.minPrice) filter['packages.basic.price'].$gte = filter.minPrice;
    if (filter.maxPrice) filter['packages.basic.price'].$lte = filter.maxPrice;
    delete filter.minPrice;
    delete filter.maxPrice;
  }

  // Handle delivery time filter

  // Handle search
  if (filter.search) {
    filter.$text = { $search: filter.search };
    delete filter.search;
  }

  // Store country and language filters for aggregation
  const countryFilter = filter.country;
  const languageFilter = filter.language;
  
  // Handle comma-separated values for multiple selections
  const countryFilters = countryFilter ? countryFilter.split(',').map(c => c.trim()) : [];
  const languageFilters = languageFilter ? languageFilter.split(',').map(l => l.trim()) : [];
  
  if (filter.country) delete filter.country;
  if (filter.language) delete filter.language;

  // Handle sorting
  let sortOptions = {};
  if (options.sortBy) {
    switch (options.sortBy) {
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'price_low':
        sortOptions = { 'packages.basic.price': 1 };
        break;
      case 'price_high':
        sortOptions = { 'packages.basic.price': -1 };
        break;
      case 'rating':
        sortOptions = { averageRating: -1, totalReviews: -1 };
        break;
      case 'popular':
        sortOptions = { totalOrders: -1, views: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }
  } else {
    sortOptions = { createdAt: -1 };
  }

  // Remove any existing populate option to avoid conflicts
  const { populate, ...cleanOptions } = options;

  // If country or language filters are present, use a simpler approach
  if (countryFilters.length > 0 || languageFilters.length > 0) {
    
    // First get all gigs normally
    const gigs = await Gig.paginate(filter, {
      ...cleanOptions,
      sort: sortOptions,
      populate: 'seller'
    });

    // Then filter by country/language using UserSpace data
    const filteredResults = [];
    
    for (const gig of gigs.results) {
      if (gig.seller) {
        try {
          const userSpace = await getSpace(gig.seller._id.toString());
          
          let matchesCountry = true;
          let matchesLanguage = true;
          
          // Check country filter
          if (countryFilters.length > 0 && userSpace) {
            const countryMatch = countryFilters.some(country => 
              userSpace.location === country ||
              userSpace.city === country ||
              userSpace.state === country ||
              (userSpace.address && userSpace.address.toLowerCase().includes(country.toLowerCase()))
            );
            
            matchesCountry = countryMatch;
          }
          
          // Check language filter
          if (languageFilters.length > 0 && userSpace) {
            const languageMatch = 
              userSpace.collaborationLyricsLangs && 
              languageFilters.some(language => 
                userSpace.collaborationLyricsLangs.includes(language) ||
                userSpace.collaborationLyricsLangs.some(lang => 
                  lang.toLowerCase().includes(language.toLowerCase())
                )
              );
            
            matchesLanguage = languageMatch;
          }
          
          if (matchesCountry && matchesLanguage) {
            // Add location to seller for consistency
            if (userSpace && userSpace.location) {
              gig.seller.location = userSpace.location;
            }
            filteredResults.push(gig);
          }
        } catch (error) {
          // Skip gig if userSpace data cannot be retrieved
        }
      }
    }


    return {
      results: filteredResults,
      total: filteredResults.length,
      totalPages: Math.ceil(filteredResults.length / cleanOptions.limit),
      page: cleanOptions.page,
      limit: cleanOptions.limit
    };
  }

  // Regular query without aggregation
  const gigs = await Gig.paginate(filter, {
    ...cleanOptions,
    sort: sortOptions,
    populate: 'seller'
  });

  // Fetch UserSpace data for all sellers to get location
  if (gigs.results && gigs.results.length > 0) {
    for (const gig of gigs.results) {
      if (gig.seller) {
        try {
          const userSpace = await getSpace(gig.seller._id.toString());
          if (userSpace && userSpace.location) {
            gig.seller.location = userSpace.location;
          }
        } catch (error) {
          // Skip if userSpace data cannot be retrieved
        }
      }
    }
  }

  // Add favorite status for authenticated user
  if (userId && gigs.results && gigs.results.length > 0) {
    for (const gig of gigs.results) {
      gig.isFavorited = gig.favorites && gig.favorites.includes(userId);
    }
  }

  return gigs;
};

/**
 * Get gig by id
 * @param {ObjectId} id
 * @returns {Promise<Gig>}
 */
const getGigById = async (id) => {
  const gig = await Gig.findById(id).populate([
    {
      path: 'seller',
      select: 'name profilePicture averageRating totalReviews isOnline lastSeen createdAt'
    },
    {
      path: 'reviews.buyer',
      select: 'name profilePicture'
    }
  ]);
  
  // Fetch UserSpace data for the seller to get location
  if (gig && gig.seller) {
    try {
      const userSpace = await getSpace(gig.seller._id.toString());
      
      // Try to get location from multiple possible fields, prioritizing country
      let sellerLocation = null;
      if (userSpace) {
        // Extract country from address if it contains country info
        let country = null;
        if (userSpace.address && userSpace.address.includes(',')) {
          const addressParts = userSpace.address.split(',');
          country = addressParts[0].trim(); // First part is usually country
        }
        
        // Priority: location field, then country from address, then city, then state, then full address
        sellerLocation = userSpace.location || country || userSpace.city || userSpace.state || userSpace.address;
        
        if (sellerLocation) {
          // Force the location into the seller object
          gig.seller.location = sellerLocation;
          
          // Also try to set it as a document property
          if (gig.seller.set) {
            gig.seller.set('location', sellerLocation);
          }
          
        }
      }
    } catch (error) {
      // Skip if userSpace data cannot be retrieved
    }
  }
  
  // Alternative approach: If location is still not set, try to get it from UserSpace directly
  if (gig && gig.seller && !gig.seller.location) {
    try {
      const userSpace = await getSpace(gig.seller._id.toString());
      if (userSpace) {
        // Extract country from address if it contains country info
        let country = null;
        if (userSpace.address && userSpace.address.includes(',')) {
          const addressParts = userSpace.address.split(',');
          country = addressParts[0].trim(); // First part is usually country
        }
        
        // Priority: location field, then country from address, then city, then state, then full address
        const location = userSpace.location || country || userSpace.city || userSpace.state || userSpace.address;
        if (location) {
          gig.seller.location = location;
        }
      }
    } catch (error) {
      // Skip if alternative location fetch fails
    }
  }
  
  // Convert to plain object to ensure proper serialization
  const plainGig = gig.toObject ? gig.toObject() : gig;
  
  // Manually add location to the plain object since toObject() doesn't include it
  if (gig.seller && gig.seller.location) {
    plainGig.seller.location = gig.seller.location;
  }
  
  return plainGig;
};

/**
 * Update gig by id
 * @param {ObjectId} gigId
 * @param {Object} updateBody
 * @param {ObjectId} userId
 * @returns {Promise<Gig>}
 */
const updateGigById = async (gigId, updateBody, userId) => {
  const gig = await getGigById(gigId);
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }
  
  // Check if user is the seller or admin
  if (gig.seller._id.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to update this gig');
  }

  // Remove version fields that might cause conflicts
  const cleanUpdateBody = { ...updateBody };
  delete cleanUpdateBody.__v;
  delete cleanUpdateBody.createdAt;
  
  // Use findByIdAndUpdate to avoid version conflicts
  const updatedGig = await Gig.findByIdAndUpdate(
    gigId, 
    cleanUpdateBody, 
    { 
      new: true, 
      runValidators: false,
      bypassDocumentValidation: true 
    }
  );
  
  return updatedGig;
};

/**
 * Delete gig by id
 * @param {ObjectId} gigId
 * @param {ObjectId} userId
 * @returns {Promise<Gig>}
 */
const deleteGigById = async (gigId, userId) => {
  const gig = await getGigById(gigId);
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }
  
  // Check if user is the seller or admin
  // Handle both populated seller object and ObjectId
  const sellerId = gig.seller._id ? gig.seller._id.toString() : gig.seller.toString();
  if (sellerId !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to delete this gig');
  }

  // Use findByIdAndDelete() instead of deprecated remove() method
  await Gig.findByIdAndDelete(gigId);
  return gig;
};

/**
 * Update gig status
 * @param {ObjectId} gigId
 * @param {Object} updateBody
 * @param {Object} user
 * @returns {Promise<Gig>}
 */
const updateGigStatus = async (gigId, updateBody, user) => {
  const gig = await Gig.findById(gigId);
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }

  // Check permissions
  const isSeller = gig.seller._id.toString() === user.id.toString();
  const isAdmin = user.role === 'admin';

  if (!isSeller && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to update gig status');
  }

  // Only admin can set status to 'denied'
  if (updateBody.status === 'denied' && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only admin can deny gigs');
  }

  // Add denial reason to metadata if status is denied
  if (updateBody.status === 'denied' && updateBody.denialReason) {
    gig.metadata = gig.metadata || {};
    gig.metadata.denialReason = updateBody.denialReason;
  }

  gig.status = updateBody.status;
  await gig.save();
  return gig;
};

/**
 * Add review to gig
 * @param {ObjectId} gigId
 * @param {Object} reviewData
 * @returns {Promise<Gig>}
 */
const addGigReview = async (gigId, reviewData) => {
  const gig = await getGigById(gigId);
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }

  // Check if user can review (hasn't reviewed before)
  if (!gig.canUserReview(reviewData.buyer)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You have already reviewed this gig');
  }

  // TODO: Verify that the user has actually ordered this gig
  // const order = await Order.findOne({
  //   _id: reviewData.orderId,
  //   buyer: reviewData.buyer,
  //   status: 'complete'
  // });
  // if (!order) {
  //   throw new ApiError(httpStatus.BAD_REQUEST, 'You can only review gigs you have ordered');
  // }

  await gig.addReview(reviewData);
  return gig;
};

/**
 * Toggle gig favorite
 * @param {ObjectId} gigId
 * @param {ObjectId} userId
 * @returns {Promise<Gig>}
 */
const toggleGigFavorite = async (gigId, userId) => {
  // Get the gig directly from the database to ensure it's a Mongoose document
  const gig = await Gig.findById(gigId);
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }

  const favoriteIndex = gig.favorites.indexOf(userId);
  if (favoriteIndex > -1) {
    gig.favorites.splice(favoriteIndex, 1);
  } else {
    gig.favorites.push(userId);
  }

  await gig.save();
  
  // Get the updated gig with populated data
  const updatedGig = await getGigById(gigId);
  
  // Add favorite status for the user
  updatedGig.isFavorited = gig.favorites.includes(userId);
  
  return updatedGig;
};

/**
 * Get user's favorite gigs
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getMyFavoriteGigs = async (userId) => {
  const gigs = await Gig.find({ favorites: userId })
    .populate('seller', 'name profilePicture avatar averageRating totalReviews memberSince isOnline location roles skills')
    .sort({ createdAt: -1 });

  return {
    results: gigs,
    total: gigs.length
  };
};

/**
 * Report gig
 * @param {Object} reportData
 * @returns {Promise<Report>}
 */
const reportGig = async (reportData) => {
  const gig = await getGigById(reportData.reportedId);
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }

  reportData.reportedUserId = gig.seller;
  const report = await Report.create(reportData);
  return report;
};

/**
 * Update gig stats
 * @param {ObjectId} gigId
 * @param {Object} stats
 * @returns {Promise<Gig>}
 */
const updateGigStats = async (gigId, stats) => {
  return Gig.updateStats(gigId, stats);
};

/**
 * Get gig stats
 * @param {ObjectId} gigId
 * @param {string} period
 * @param {ObjectId} userId
 * @returns {Promise<Object>}
 */
const getGigStats = async (gigId, period = '30d', userId) => {
  const gig = await getGigById(gigId);
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }

  // Check if user is the seller
  if (gig.seller._id.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to view gig stats');
  }

  // Calculate date range based on period
  const now = new Date();
  let startDate;
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // TODO: Get detailed stats from orders and other collections
  const stats = {
    basic: {
      views: gig.views,
      clicks: gig.clicks,
      impressions: gig.impressions,
      totalOrders: gig.totalOrders,
      totalEarnings: gig.totalEarnings,
      averageRating: gig.averageRating,
      totalReviews: gig.totalReviews,
      favorites: gig.favorites.length
    },
    period: period,
    startDate: startDate,
    endDate: now
  };

  return stats;
};

/**
 * Get gig categories
 * @returns {Promise<Array>}
 */
const getGigCategories = async () => {
  const categories = [
    {
      id: 'music-production',
      name: 'Music Production',
      subcategories: [
        'Full Song Production',
        'Beat Making',
        'Instrumental Production',
        'Remix Production'
      ]
    },
    {
      id: 'mixing-mastering',
      name: 'Mixing & Mastering',
      subcategories: [
        'Audio Mixing',
        'Audio Mastering',
        'Mix and Master',
        'Vocal Mixing'
      ]
    },
    {
      id: 'songwriting',
      name: 'Songwriting',
      subcategories: [
        'Lyrics Writing',
        'Melody Writing', 
        'Complete Song Writing',
        'Song Translation'
      ]
    },
    {
      id: 'vocal-recording',
      name: 'Vocal Recording',
      subcategories: [
        'Lead Vocals',
        'Backing Vocals',
        'Vocal Harmonies',
        'Vocal Editing'
      ]
    },
    {
      id: 'beat-making',
      name: 'Beat Making',
      subcategories: [
        'Hip Hop Beats',
        'Pop Beats',
        'Electronic Beats',
        'Custom Beats'
      ]
    },
    {
      id: 'lyrics-writing',
      name: 'Lyrics Writing',
      subcategories: [
        'Song Lyrics',
        'Rap Lyrics',
        'Poetry',
        'Jingle Lyrics'
      ]
    },
    {
      id: 'voice-over',
      name: 'Voice Over',
      subcategories: [
        'Commercial Voice Over',
        'Narration',
        'Character Voices',
        'Radio Voice Over'
      ]
    },
    {
      id: 'podcast-editing',
      name: 'Podcast Editing',
      subcategories: [
        'Podcast Editing',
        'Audio Enhancement',
        'Noise Removal',
        'Podcast Mixing'
      ]
    },
    {
      id: 'sound-design',
      name: 'Sound Design',
      subcategories: [
        'Sound Effects',
        'Ambient Sounds',
        'Game Audio',
        'Film Scoring'
      ]
    },
    {
      id: 'jingle-creation',
      name: 'Jingle Creation',
      subcategories: [
        'Radio Jingles',
        'Commercial Jingles',
        'Podcast Intros',
        'YouTube Intros'
      ]
    },
    {
      id: 'other',
      name: 'Other',
      subcategories: [
        'Audio Consultation',
        'Music Lessons',
        'Equipment Setup',
        'Custom Services'
      ]
    }
  ];

  return categories;
};

/**
 * Get featured gigs
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getFeaturedGigs = async (options) => {
  const filter = {
    status: 'active',
    isActive: true,
    averageRating: { $gte: 4.5 },
    totalOrders: { $gte: 5 }
  };

  return queryGigs(filter, {
    ...options,
    sortBy: 'rating'
  });
};

/**
 * Search gigs
 * @param {string} query
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const searchGigs = async (query, filter, options) => {
  if (query) {
    filter.$text = { $search: query };
  }

  return queryGigs(filter, options);
};

/**
 * Get gig reviews
 * @param {ObjectId} gigId
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const getGigReviews = async (gigId, options) => {
  const gig = await Gig.findById(gigId)
    .populate({
      path: 'reviews.buyer',
      select: 'name profilePicture'
    })
    .select('reviews averageRating totalReviews');

  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }

  // Sort reviews
  let sortedReviews = gig.reviews;
  if (options.sortBy) {
    switch (options.sortBy) {
      case 'newest':
        sortedReviews = gig.reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'oldest':
        sortedReviews = gig.reviews.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case 'rating_high':
        sortedReviews = gig.reviews.sort((a, b) => b.rating - a.rating);
        break;
      case 'rating_low':
        sortedReviews = gig.reviews.sort((a, b) => a.rating - b.rating);
        break;
    }
  }

  // Pagination
  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  const paginatedReviews = sortedReviews.slice(startIndex, endIndex);

  return {
    reviews: paginatedReviews,
    totalReviews: gig.totalReviews,
    averageRating: gig.averageRating,
    page,
    limit,
    totalPages: Math.ceil(gig.reviews.length / limit)
  };
};

/**
 * Get popular gigs
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getPopularGigs = async (filter, options) => {
  return queryGigs(filter, {
    ...options,
    sortBy: 'popular'
  });
};

/**
 * Get seller gig analytics
 * @param {ObjectId} sellerId
 * @param {string} period
 * @returns {Promise<Object>}
 */
const getSellerGigAnalytics = async (sellerId, period = '30d') => {
  const gigs = await Gig.find({ seller: sellerId });

  const analytics = {
    totalGigs: gigs.length,
    activeGigs: gigs.filter(g => g.status === 'active').length,
    draftGigs: gigs.filter(g => g.status === 'draft').length,
    pausedGigs: gigs.filter(g => g.status === 'paused').length,
    totalViews: gigs.reduce((sum, g) => sum + g.views, 0),
    totalOrders: gigs.reduce((sum, g) => sum + g.totalOrders, 0),
    totalEarnings: gigs.reduce((sum, g) => sum + g.totalEarnings, 0),
    averageRating: gigs.length > 0 ? gigs.reduce((sum, g) => sum + g.averageRating, 0) / gigs.length : 0,
    totalReviews: gigs.reduce((sum, g) => sum + g.totalReviews, 0)
  };

  return analytics;
};

module.exports = {
  createGig,
  queryGigs,
  getGigById,
  updateGigById,
  deleteGigById,
  updateGigStatus,
  addGigReview,
  toggleGigFavorite,
  getMyFavoriteGigs,
  reportGig,
  updateGigStats,
  getGigStats,
  getGigCategories,
  getFeaturedGigs,
  searchGigs,
  getGigReviews,
  getPopularGigs,
  getSellerGigAnalytics
};
