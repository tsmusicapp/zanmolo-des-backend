const httpStatus = require('http-status');
const { Purchase, ShareMusicAsset, User } = require('../models');
const ApiError = require('../utils/ApiError');
const moment = require('moment');
const crypto = require('crypto');

/**
 * Get purchase history for a user with search, filters, and pagination
 * @param {string} userId - User ID
 * @param {Object} filter - Search and filter options
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>}
 */
const getPurchaseHistory = async (userId, filter = {}, options = {}) => {
  try {
    console.log('getPurchaseHistory called with userId:', userId);
    
    // Validasi userId
    if (!userId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'User ID is required');
    }

    const {
      search = '',
      status,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      sortBy = 'createdAt:desc',
      limit = 10,
      page = 1
    } = { ...filter, ...options };

    // Build query - menggunakan field 'user' dari model Purchase
    const query = { user: userId };

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = moment(dateFrom).startOf('day').toDate();
      }
      if (dateTo) {
        query.createdAt.$lte = moment(dateTo).endOf('day').toDate();
      }
    }

    // Filter by amount range
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) {
        query.amount.$gte = Number(minAmount);
      }
      if (maxAmount) {
        query.amount.$lte = Number(maxAmount);
      }
    }

    console.log('Final query:', JSON.stringify(query, null, 2));

    // Parse sort
    const sort = {};
    if (sortBy) {
      const [field, order] = sortBy.split(':');
      sort[field] = order === 'desc' ? -1 : 1;
    }

    const offset = (page - 1) * limit;

    // Get total count first
    const totalResults = await Purchase.countDocuments(query);
    console.log('Total purchases found for user:', totalResults);

    // Jika tidak ada data, langsung return empty result
    if (totalResults === 0) {
      return {
        results: [],
        page: Number(page),
        limit: Number(limit),
        totalPages: 0,
        totalResults: 0,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }

    // Get purchases dengan populate
    const purchases = await Purchase.find(query)
      .populate({
        path: 'music',
        select: 'songName musicImage music personalUsePrice commercialUsePrice myRole musicUsage musicStyle createdBy title uploadAsset',
        populate: {
          path: 'createdBy',
          select: 'name email',
        },
        // Handle case where music document might be deleted
        match: { _id: { $exists: true } }
      })
      .populate({
        path: 'user',
        select: 'name email',
      })
      .sort(sort)
      .limit(Number(limit))
      .skip(offset)
      .lean();

    console.log('Raw purchases retrieved:', purchases.length);
    
    // Debug: Log structure of first purchase if exists
    if (purchases.length > 0) {
      console.log('Sample purchase structure:', {
        id: purchases[0]._id,
        hasMusic: !!purchases[0].music,
        musicId: purchases[0].music?._id,
        musicTitle: purchases[0].music?.songName,
        hasCreatedBy: !!purchases[0].music?.createdBy,
        creatorName: purchases[0].music?.createdBy?.name
      });
    }

    // Search by music/asset name after populate (jika ada search)
    let filteredPurchases = purchases;
    if (search) {
      filteredPurchases = purchases.filter(purchase => {
        const songName = purchase.music?.songName || '';
        return songName.toLowerCase().includes(search.toLowerCase());
      });
    }

    // Transform data for response
    const results = filteredPurchases.map(purchase => {
      // Safely handle music data
      const musicData = purchase.music || {};
      const creatorData = musicData.createdBy || {};
      const myRole = Array.isArray(musicData.myRole) ? musicData.myRole : [];
      
      return {
        id: purchase._id,
        assetId: musicData._id || null,
        assetTitle: musicData.title || 'Unknown Song',
        assetImage: musicData.musicImage || null,
        assetType: myRole.length > 0 ? myRole.join(', ') : 'Unknown',
        creatorName: creatorData.name || 'Unknown Creator',
        creatorId: creatorData._id || null,
        purchaseDate: purchase.createdAt,
        amount: purchase.amount || 0,
        totalAmount: purchase.amount || 0,
        status: purchase.status || 'unknown',
        paymentMethod: purchase.paymentMethod || 'unknown',
        paymentId: purchase.squarePaymentId || null,
        licenseType: purchase.licenseType || 'unknown',
        licenseId: purchase.licenseId || null,
        transactionId: purchase.transactionId || null,
        downloadCount: purchase.downloadCount || 0,
        downloadLimit: 10,
        canDownload: (purchase.downloadCount || 0) < 10 && purchase.status === 'completed',
        musicFile: musicData.uploadAsset || null,
        assetDetails: {
          musicUsage: Array.isArray(musicData.musicUsage) ? musicData.musicUsage : [],
          musicStyle: musicData.musicStyle || '',
          personalUsePrice: musicData.personalUsePrice || '',
          commercialUsePrice: musicData.commercialUsePrice || '',
        }
      };
    });

    const totalPages = Math.ceil(totalResults / limit);

    const response = {
      results,
      page: Number(page),
      limit: Number(limit),
      totalPages,
      totalResults,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    console.log('Final response summary:', {
      resultsCount: results.length,
      totalResults,
      totalPages,
      page,
      limit
    });

    return response;

  } catch (error) {
    console.error('Error in getPurchaseHistory:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error fetching purchase history: ${error.message}`);
  }
};

/**
 * Get detailed purchase information
 * @param {string} purchaseId - Purchase ID
 * @param {string} userId - User ID (for security check)
 * @returns {Promise<Object>}
 */
const getPurchaseDetails = async (purchaseId, userId) => {
  try {
    const purchase = await Purchase.findOne({ _id: purchaseId, user: userId })
      .populate({
        path: 'music',
        select: 'songName musicImage music personalUsePrice commercialUsePrice myRole musicUsage musicStyle description tags createdBy',
        populate: {
          path: 'createdBy',
          select: 'name email',
        }
      })
      .populate({
        path: 'user',
        select: 'name email',
      })
      .lean();

    if (!purchase) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
    }

    return {
      id: purchase._id,
      assetId: purchase.music?._id,
      assetTitle: purchase.music?.songName || 'Unknown Song',
      assetImage: purchase.music?.musicImage,
      assetDescription: purchase.music?.description,
      assetTags: purchase.music?.tags,
      creatorName: purchase.music?.createdBy?.name || 'Unknown Creator',
      creatorId: purchase.music?.createdBy?._id,
      creatorEmail: purchase.music?.createdBy?.email,
      purchaseDate: purchase.createdAt,
      amount: purchase.amount,
      totalAmount: purchase.amount,
      status: purchase.status,
      paymentMethod: purchase.paymentMethod,
      paymentId: purchase.squarePaymentId,
      licenseType: purchase.licenseType,
      licenseId: purchase.licenseId,
      transactionId: purchase.transactionId,
      downloadCount: purchase.downloadCount || 0,
      downloadLimit: 10,
      canDownload: (purchase.downloadCount || 0) < 10 && purchase.status === 'completed',
      musicFile: purchase.music?.music,
      assetDetails: {
        musicUsage: purchase.music?.musicUsage,
        musicStyle: purchase.music?.musicStyle,
        personalUsePrice: purchase.music?.personalUsePrice,
        commercialUsePrice: purchase.music?.commercialUsePrice,
        myRole: purchase.music?.myRole,
      },
      metadata: purchase.metadata,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('Error fetching purchase details:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching purchase details');
  }
};

/**
 * Generate secure download URL for purchased asset
 * @param {string} purchaseId - Purchase ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
const generateDownloadUrl = async (purchaseId, userId) => {
  try {
    const purchase = await Sale.findOne({ _id: purchaseId, buyerId: userId })
      .populate('assetId', 'music songName');

    if (!purchase) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
    }

    if (purchase.status !== 'completed') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Purchase not completed');
    }

    if (purchase.downloadCount >= purchase.downloadLimit) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Download limit exceeded');
    }

    // Generate secure token for download
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = moment().add(1, 'hours').toDate(); // URL expires in 1 hour

    const downloadUrl = {
      url: `/api/v1/purchases/${purchaseId}/download/${token}`,
      expiresAt,
      createdAt: new Date()
    };

    // Add to download URLs and increment count
    purchase.downloadUrls.push(downloadUrl);
    purchase.downloadCount += 1;
    await purchase.save();

    return {
      downloadUrl: downloadUrl.url,
      expiresAt: downloadUrl.expiresAt,
      filename: purchase.assetId?.songName || 'music_file',
      downloadCount: purchase.downloadCount,
      downloadLimit: purchase.downloadLimit,
      remainingDownloads: purchase.downloadLimit - purchase.downloadCount
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error generating download URL');
  }
};

/**
 * Get sales data for music creators
 * @param {string} userId - Creator user ID
 * @param {Object} filter - Search and filter options
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>}
 */
const getSalesData = async (userId, filter = {}, options = {}) => {
  const {
    search = '',
    status,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    sortBy = 'createdAt:desc',
    limit = 10,
    page = 1
  } = { ...filter, ...options };

  // Build query for sales where user is the owner/creator
  const query = { OwnerId: userId };

  // Search by music/asset name or buyer name
  if (search) {
    query.$or = [
      { assetTitle: { $regex: search, $options: 'i' } },
      { buyer: { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by date range
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) {
      query.createdAt.$gte = moment(dateFrom).startOf('day').toDate();
    }
    if (dateTo) {
      query.createdAt.$lte = moment(dateTo).endOf('day').toDate();
    }
  }

  // Filter by amount range
  if (minAmount || maxAmount) {
    query.totalAmount = {};
    if (minAmount) {
      query.totalAmount.$gte = Number(minAmount);
    }
    if (maxAmount) {
      query.totalAmount.$lte = Number(maxAmount);
    }
  }

  // Parse sort
  const sort = {};
  if (sortBy) {
    const [field, order] = sortBy.split(':');
    sort[field] = order === 'desc' ? -1 : 1;
  }

  const offset = (page - 1) * limit;

  try {
    const [sales, totalResults] = await Promise.all([
      Sale.find(query)
        .populate({
          path: 'assetId',
          select: 'songName musicImage myRole musicUsage musicStyle',
        })
        .populate({
          path: 'buyerId',
          select: 'name email',
        })
        .sort(sort)
        .limit(limit)
        .skip(offset)
        .lean(),
      Sale.countDocuments(query)
    ]);

    // Transform data for response
    const results = sales.map(sale => ({
      id: sale._id,
      assetId: sale.assetId?._id,
      assetTitle: sale.assetTitle,
      assetImage: sale.assetId?.musicImage,
      assetType: sale.assetId?.myRole?.join(', '),
      buyerName: sale.buyer,
      buyerId: sale.buyerId?._id,
      buyerEmail: sale.buyerId?.email,
      saleDate: sale.createdAt,
      amount: sale.assetPrice,
      quantity: sale.quantity,
      totalAmount: sale.totalAmount,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      paymentId: sale.paymentId,
    }));

    const totalPages = Math.ceil(totalResults / limit);

    // Calculate summary statistics
    const totalEarnings = await Sale.aggregate([
      { $match: { OwnerId: userId, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ]);

    const summary = {
      totalEarnings: totalEarnings[0]?.total || 0,
      totalSales: totalEarnings[0]?.count || 0,
    };

    return {
      results,
      page: Number(page),
      limit: Number(limit),
      totalPages,
      totalResults,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      summary
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching sales data');
  }
};

module.exports = {
  getPurchaseHistory,
  getPurchaseDetails,
  generateDownloadUrl,
  getSalesData,
};
