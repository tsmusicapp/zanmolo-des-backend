const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { gigService } = require('../services');

const createGig = catchAsync(async (req, res) => {
  const mongoose = require('mongoose');
  const { aiCustomInstructions, ...restBody } = req.body;
  const gigBody = { 
    ...restBody, 
    additionalInformation: aiCustomInstructions || '',
    seller: new mongoose.Types.ObjectId(req.user.id) 
  };
  const gig = await gigService.createGig(gigBody);
  res.status(httpStatus.CREATED).send(gig);
});

const getGigs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['category', 'subcategory', 'minPrice', 'maxPrice', 'deliveryTime', 'seller', 'search', 'status', 'country', 'language']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  // Only show active gigs for public listing unless user is admin or seller
  if (!req.user || req.user.role !== 'admin') {
    filter.status = 'active';
    filter.isActive = true;
  }
  
  const result = await gigService.queryGigs(filter, options, req.user?.id);
  res.send(result);
});

const getGig = catchAsync(async (req, res) => {
  const gig = await gigService.getGigById(req.params.gigId);
  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }
  
  // Increment view count if user is not the seller
  if (!req.user || req.user.id !== gig.seller.toString()) {
    await gigService.updateGigStats(req.params.gigId, { views: 1 });
  }
  
  res.send(gig);
});

const getMyGigs = catchAsync(async (req, res) => {
  const filter = { seller: req.user.id };
  const statusFilter = pick(req.query, ['status']);
  if (statusFilter.status) {
    filter.status = statusFilter.status;
  }
  
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await gigService.queryGigs(filter, options);
  res.send(result);
});

const getMyFavoriteGigs = catchAsync(async (req, res) => {
  const result = await gigService.getMyFavoriteGigs(req.user.id);
  res.send(result);
});

const getGigsByUser = catchAsync(async (req, res) => {
  const filter = { 
    seller: req.params.userId,
    status: 'active',
    isActive: true
  };
  
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await gigService.queryGigs(filter, options);
  res.send(result);
});

const updateGig = catchAsync(async (req, res) => {
  const gig = await gigService.updateGigById(req.params.gigId, req.body, req.user.id);
  res.send(gig);
});

const deleteGig = catchAsync(async (req, res) => {
  await gigService.deleteGigById(req.params.gigId, req.user.id);
  res.status(httpStatus.NO_CONTENT).send();
});

const updateGigStatus = catchAsync(async (req, res) => {
  const gig = await gigService.updateGigStatus(req.params.gigId, req.body, req.user);
  res.send(gig);
});

const addGigReview = catchAsync(async (req, res) => {
  const reviewData = {
    ...req.body,
    buyer: req.user.id
  };
  const gig = await gigService.addGigReview(req.params.gigId, reviewData);
  res.send(gig);
});

const favoriteGig = catchAsync(async (req, res) => {
  const gig = await gigService.toggleGigFavorite(req.params.gigId, req.user.id);
  res.send(gig);
});

const reportGig = catchAsync(async (req, res) => {
  const reportData = {
    userId: req.user.id,
    type: 'gig',
    reportedId: req.params.gigId,
    reportedUserId: null, // Will be populated in service
    reason: req.body.reason,
    description: req.body.description
  };
  
  const report = await gigService.reportGig(reportData);
  res.status(httpStatus.CREATED).send(report);
});

const getGigStats = catchAsync(async (req, res) => {
  const stats = await gigService.getGigStats(req.params.gigId, req.query.period, req.user.id);
  res.send(stats);
});

const getGigCategories = catchAsync(async (req, res) => {
  const categories = await gigService.getGigCategories();
  res.send(categories);
});

const getFeaturedGigs = catchAsync(async (req, res) => {
  const options = pick(req.query, ['limit', 'page']);
  const result = await gigService.getFeaturedGigs(options);
  res.send(result);
});

const searchGigs = catchAsync(async (req, res) => {
  const { q: query } = req.query;
  const filter = pick(req.query, ['category', 'subcategory', 'minPrice', 'maxPrice', 'deliveryTime']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  filter.status = 'active';
  filter.isActive = true;
  
  const result = await gigService.searchGigs(query, filter, options);
  res.send(result);
});

const getGigReviews = catchAsync(async (req, res) => {
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const reviews = await gigService.getGigReviews(req.params.gigId, options);
  res.send(reviews);
});

const getPopularGigs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['category']);
  const options = pick(req.query, ['limit', 'page']);
  
  filter.status = 'active';
  filter.isActive = true;
  
  const result = await gigService.getPopularGigs(filter, options);
  res.send(result);
});

const getSellerGigAnalytics = catchAsync(async (req, res) => {
  const analytics = await gigService.getSellerGigAnalytics(req.user.id, req.query.period);
  res.send(analytics);
});

const uploadGigVideo = catchAsync(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file uploaded' });
    }

    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Upload video to S3 using the same system as chat attachments
    const { uploadFileToS3 } = require('../middlewares/upload');
    const uploadResult = await uploadFileToS3(req.file, userId);

    res.status(200).json({
      success: true,
      data: {
        url: uploadResult.url,
        key: uploadResult.key,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Gig video upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload video',
      error: error.message 
    });
  }
});

const uploadGigImage = catchAsync(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Upload image to S3
    const { uploadFileToS3 } = require('../middlewares/upload');
    const uploadResult = await uploadFileToS3(req.file, userId);

    res.status(200).json({
      success: true,
      message: 'Gig image uploaded successfully',
      data: {
        url: uploadResult.url,
        key: uploadResult.key,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Gig image upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload image',
      error: error.message 
    });
  }
});

module.exports = {
  createGig,
  getGigs,
  getGig,
  getMyGigs,
  getMyFavoriteGigs,
  getGigsByUser,
  updateGig,
  deleteGig,
  updateGigStatus,
  addGigReview,
  favoriteGig,
  reportGig,
  getGigStats,
  getGigCategories,
  getFeaturedGigs,
  searchGigs,
  getGigReviews,
  getPopularGigs,
  getSellerGigAnalytics,
  uploadGigVideo,
  uploadGigImage
};
