const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { orderHistoryService } = require('../services');
const pick = require('../utils/pick');

/**
 * Get order history with search, filters, and pagination
 */
const getOrderHistory = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const filter = pick(req.query, ['search', 'status', 'dateFrom', 'dateTo', 'minAmount', 'maxAmount']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  const result = await orderHistoryService.getOrderHistory(userId, userRole, filter, options);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Order history retrieved successfully',
    data: result
  });
});

/**
 * Get detailed order information
 */
const getOrderDetails = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  
  const result = await orderHistoryService.getOrderDetails(orderId, userId, userRole);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Order details retrieved successfully',
    data: result
  });
});

/**
 * Generate secure download URL for order delivery files
 */
const generateOrderDownloadUrl = catchAsync(async (req, res) => {
  const { orderId, fileId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  
  const result = await orderHistoryService.generateOrderDownloadUrl(orderId, fileId, userId, userRole);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Download URL generated successfully',
    data: result
  });
});

/**
 * Download order delivery file (actual file download)
 */
const downloadOrderFile = catchAsync(async (req, res) => {
  const { orderId, fileId, token } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  
  // Verify token and get file details
  const order = await orderHistoryService.getOrderDetails(orderId, userId, userRole);
  
  // Find valid download URL with token
  const validDownloadUrl = order.downloadUrls?.find(
    url => url.url.includes(token) && new Date(url.expiresAt) > new Date()
  );
  
  if (!validDownloadUrl) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Invalid or expired download token'
    });
  }
  
  // Find the specific file
  const file = order.deliveryFiles?.find(f => f._id.toString() === fileId);
  if (!file) {
    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: 'File not found'
    });
  }
  
  // In a real implementation, you would:
  // 1. Get the actual file path from storage (S3, local, etc.)
  // 2. Stream the file to the response
  // 3. Set appropriate headers for download
  
  // For now, return file info
  res.status(httpStatus.OK).json({
    success: true,
    message: 'File download initiated',
    data: {
      filename: file.filename,
      fileUrl: file.url,
      downloadToken: token
    }
  });
});

/**
 * Get order statistics for dashboard
 */
const getOrderStats = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  
  const result = await orderHistoryService.getOrderStats(userId, userRole);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Order statistics retrieved successfully',
    data: result
  });
});

module.exports = {
  getOrderHistory,
  getOrderDetails,
  generateOrderDownloadUrl,
  downloadOrderFile,
  getOrderStats,
};
