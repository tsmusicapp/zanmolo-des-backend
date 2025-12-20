const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const RatingService = require('../services/rating.service');

/**
 * Get user ratings (both seller and buyer metrics)
 */
const getUserRatings = catchAsync(async (req, res) => {
  const userId = req.params.userId || req.user.id;
  
  const userRatings = await RatingService.getUserRatings(userId);
  
  if (!userRatings) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User ratings not found');
  }
  
  res.status(httpStatus.OK).send({
    success: true,
    data: userRatings
  });
});

/**
 * Update user metrics (force recalculation)
 */
const updateUserMetrics = catchAsync(async (req, res) => {
  const userId = req.params.userId || req.user.id;
  
  const updatedMetrics = await RatingService.updateUserMetrics(userId);
  
  if (!updatedMetrics) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  
  res.status(httpStatus.OK).send({
    success: true,
    message: 'User metrics updated successfully',
    data: updatedMetrics
  });
});

/**
 * Recalculate gig metrics
 */
const updateGigMetrics = catchAsync(async (req, res) => {
  const { gigId } = req.params;
  
  const updatedGig = await RatingService.calculateGigMetrics(gigId);
  
  if (!updatedGig) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Gig not found');
  }
  
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Gig metrics updated successfully',
    data: {
      averageRating: updatedGig.averageRating,
      totalReviews: updatedGig.totalReviews,
      totalOrders: updatedGig.totalOrders
    }
  });
});

module.exports = {
  getUserRatings,
  updateUserMetrics,
  updateGigMetrics
};