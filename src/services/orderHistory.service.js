const httpStatus = require('http-status');
const { Order, User, Chat } = require('../models');
const ApiError = require('../utils/ApiError');
const moment = require('moment');
const crypto = require('crypto');

/**
 * Get order history for a user with search, filters, and pagination
 * @param {string} userId - User ID
 * @param {string} role - User role ('user' or 'recruiter')
 * @param {Object} filter - Search and filter options
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>}
 */
const getOrderHistory = async (userId, role, filter = {}, options = {}) => {
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

  // Build query based on user role
  let query = {};
  if (role === 'user') {
    query.createdBy = userId; // Orders created by user
  } else if (role === 'recruiter') {
    query.recruiterId = userId; // Orders assigned to recruiter
  } else {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid user role');
  }

  // Search by title or description
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
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
    const [orders, totalResults] = await Promise.all([
      Order.find(query)
        .populate({
          path: 'recruiterId',
          select: 'name email',
        })
        .populate({
          path: 'createdBy',
          select: 'name email',
        })
        .populate({
          path: 'chat_id',
          select: 'participants',
        })
        .sort(sort)
        .limit(limit)
        .skip(offset)
        .lean(),
      Order.countDocuments(query)
    ]);

    // Transform data for response
    const results = orders.map(order => ({
      id: order._id,
      title: order.title,
      description: order.description,
      details: order.details,
      status: order.status,
      price: order.price,
      totalAmount: order.totalAmount || order.price,
      tip: order.tip || 0,
      startTime: order.startTime,
      completedAt: order.completedAt,
      deliveryTime: order.delivery_time,
      rating: order.rating,
      review: order.review,
      paymentMethod: order.paymentMethod,
      paymentId: order.paymentId,
      // Client/Recruiter info (depending on perspective)
      client: role === 'recruiter' ? {
        id: order.createdBy?._id,
        name: order.createdBy?.name,
        email: order.createdBy?.email,
      } : null,
      recruiter: role === 'user' ? {
        id: order.recruiterId?._id,
        name: order.recruiterId?.name,
        email: order.recruiterId?.email,
      } : null,
      // Files and downloads
      deliveryFiles: order.deliveryFiles || [],
      downloadUrls: order.downloadUrls || [],
      canDownload: order.status === 'complete' && order.deliveryFiles?.length > 0,
      // Messages
      revisionMessage: order.revison_message,
      cancelMessage: order.cancel_message,
      // Chat
      chatId: order.chat_id?._id,
    }));

    const totalPages = Math.ceil(totalResults / limit);

    return {
      results,
      page: Number(page),
      limit: Number(limit),
      totalPages,
      totalResults,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching order history');
  }
};

/**
 * Get detailed order information
 * @param {string} orderId - Order ID
 * @param {string} userId - User ID (for security check)
 * @param {string} role - User role
 * @returns {Promise<Object>}
 */
const getOrderDetails = async (orderId, userId, role) => {
  try {
    let query = { _id: orderId };
    
    // Security check based on user role
    if (role === 'user') {
      query.createdBy = userId;
    } else if (role === 'recruiter') {
      query.recruiterId = userId;
    } else {
      throw new ApiError(httpStatus.FORBIDDEN, 'Invalid user role');
    }

    const order = await Order.findOne(query)
      .populate({
        path: 'recruiterId',
        select: 'name email profilePicture',
      })
      .populate({
        path: 'createdBy',
        select: 'name email profilePicture',
      })
      .populate({
        path: 'chat_id',
        select: 'participants messages',
        populate: {
          path: 'participants',
          select: 'name email'
        }
      })
      .lean();

    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    return {
      id: order._id,
      title: order.title,
      description: order.description,
      details: order.details,
      status: order.status,
      price: order.price,
      totalAmount: order.totalAmount || order.price,
      tip: order.tip || 0,
      startTime: order.startTime,
      completedAt: order.completedAt,
      deliveryTime: order.delivery_time,
      rating: order.rating,
      review: order.review,
      paymentMethod: order.paymentMethod,
      paymentId: order.paymentId,
      musicIds: order.musicIds,
      // Client info
      client: {
        id: order.createdBy?._id,
        name: order.createdBy?.name,
        email: order.createdBy?.email,
        profilePicture: order.createdBy?.profilePicture,
      },
      // Recruiter info
      recruiter: {
        id: order.recruiterId?._id,
        name: order.recruiterId?.name,
        email: order.recruiterId?.email,
        profilePicture: order.recruiterId?.profilePicture,
      },
      // Files and downloads
      deliveryFiles: order.deliveryFiles || [],
      downloadUrls: order.downloadUrls || [],
      canDownload: order.status === 'complete' && order.deliveryFiles?.length > 0,
      // Messages
      revisionMessage: order.revison_message,
      cancelMessage: order.cancel_message,
      // Chat
      chat: {
        id: order.chat_id?._id,
        participants: order.chat_id?.participants,
        messageCount: order.chat_id?.messages?.length || 0,
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching order details');
  }
};

/**
 * Generate secure download URL for order delivery files
 * @param {string} orderId - Order ID
 * @param {string} fileId - File ID from deliveryFiles array
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @returns {Promise<Object>}
 */
const generateOrderDownloadUrl = async (orderId, fileId, userId, role) => {
  try {
    let query = { _id: orderId };
    
    // Security check based on user role
    if (role === 'user') {
      query.createdBy = userId;
    } else if (role === 'recruiter') {
      query.recruiterId = userId;
    } else {
      throw new ApiError(httpStatus.FORBIDDEN, 'Invalid user role');
    }

    const order = await Order.findOne(query);

    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    if (order.status !== 'complete') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Order not completed');
    }

    // Find the specific file
    const file = order.deliveryFiles?.find(f => f._id.toString() === fileId);
    if (!file) {
      throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
    }

    // Generate secure token for download
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = moment().add(2, 'hours').toDate(); // URL expires in 2 hours

    const downloadUrl = {
      url: `/api/v1/orders/${orderId}/download/${fileId}/${token}`,
      expiresAt,
      createdAt: new Date()
    };

    // Add to download URLs and increment file download count
    order.downloadUrls.push(downloadUrl);
    file.downloadCount = (file.downloadCount || 0) + 1;
    await order.save();

    return {
      downloadUrl: downloadUrl.url,
      expiresAt: downloadUrl.expiresAt,
      filename: file.filename,
      downloadCount: file.downloadCount,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error generating download URL');
  }
};

/**
 * Get order statistics for dashboard
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @returns {Promise<Object>}
 */
const getOrderStats = async (userId, role) => {
  try {
    let query = {};
    if (role === 'user') {
      query.createdBy = userId;
    } else if (role === 'recruiter') {
      query.recruiterId = userId;
    } else {
      throw new ApiError(httpStatus.FORBIDDEN, 'Invalid user role');
    }

    const [
      totalOrders,
      completedOrders,
      inProgressOrders,
      cancelledOrders,
      totalEarnings,
      monthlyStats
    ] = await Promise.all([
      Order.countDocuments(query),
      Order.countDocuments({ ...query, status: 'complete' }),
      Order.countDocuments({ ...query, status: { $in: ['inprogress', 'accepted', 'delivered'] } }),
      Order.countDocuments({ ...query, status: 'cancel' }),
      Order.aggregate([
        { $match: { ...query, status: 'complete' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        {
          $match: {
            ...query,
            status: 'complete',
            createdAt: {
              $gte: moment().subtract(12, 'months').startOf('month').toDate()
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 },
            earnings: { $sum: '$totalAmount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    return {
      totalOrders,
      completedOrders,
      inProgressOrders,
      cancelledOrders,
      totalEarnings: totalEarnings[0]?.total || 0,
      completionRate: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(2) : 0,
      monthlyStats: monthlyStats.map(stat => ({
        month: `${stat._id.year}-${stat._id.month.toString().padStart(2, '0')}`,
        orders: stat.count,
        earnings: stat.earnings
      }))
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching order statistics');
  }
};

module.exports = {
  getOrderHistory,
  getOrderDetails,
  generateOrderDownloadUrl,
  getOrderStats,
};
