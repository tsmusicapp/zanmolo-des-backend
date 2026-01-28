const { Gig, Order, User } = require("../models");
const mongoose = require("mongoose");

/**
 * Centralized Rating Service
 * Handles all rating calculations and updates
 */
class RatingService {
  /**
   * Calculate user's seller rating (average of all their gigs)
   */
  static async calculateUserSellerRating(userId) {
    try {
      console.log(`[RatingService] Calculating seller rating for ${userId}`);

      // Count total completed orders
      const totalOrders = await Order.countDocuments({
        createdBy: userId,
        status: "complete",
      });
      console.log(
        `[RatingService] Total completed orders (seller): ${totalOrders}`,
      );

      // Calculate average rating and reviews from rated orders
      const ratedOrders = await Order.find({
        createdBy: userId,
        status: "complete",
        buyerRating: { $exists: true, $gte: 1 },
      });

      const reviewOrders = await Order.find({
        createdBy: userId,
        status: "complete",
        buyerReview: { $exists: true, $ne: null },
      });
      const totalReviews = reviewOrders.length;

      let averageRating = 0;
      if (ratedOrders.length > 0) {
        averageRating =
          ratedOrders.reduce((sum, order) => sum + order.buyerRating, 0) /
          ratedOrders.length;
      }

      return {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        totalReviews,
        totalOrders,
      };
    } catch (error) {
      console.error("Error calculating user seller rating:", error);
      return { averageRating: 0, totalReviews: 0, totalOrders: 0 };
    }
  }

  /**
   * Calculate user's buyer rating (average from completed orders)
   */
  static async calculateUserBuyerRating(userId) {
    try {
      console.log(`[RatingService] Calculating buyer rating for ${userId}`);

      // Count total completed orders
      const totalOrders = await Order.countDocuments({
        recruiterId: userId,
        status: "complete",
      });
      console.log(
        `[RatingService] Total completed orders (buyer): ${totalOrders}`,
      );

      // Calculate average rating from rated orders
      const ratedOrders = await Order.find({
        recruiterId: userId,
        status: "complete",
        buyerRating: { $exists: true, $gte: 1 },
      });

      let averageRating = 0;
      if (ratedOrders.length > 0) {
        averageRating =
          ratedOrders.reduce((sum, order) => sum + order.buyerRating, 0) /
          ratedOrders.length;
      }

      return {
        averageRating: Math.round(averageRating * 10) / 10,
        totalOrders,
      };
    } catch (error) {
      console.error("Error calculating user buyer rating:", error);
      return { averageRating: 0, totalOrders: 0 };
    }
  }

  /**
   * Recalculate gig metrics (rating, reviews, orders)
   */
  static async calculateGigMetrics(gigId) {
    try {
      const gig = await Gig.findById(gigId);
      if (!gig) return null;

      // Calculate average rating from reviews
      if (gig.reviews && gig.reviews.length > 0) {
        const totalRating = gig.reviews.reduce(
          (sum, review) => sum + review.rating,
          0,
        );
        gig.averageRating =
          Math.round((totalRating / gig.reviews.length) * 10) / 10;
        gig.totalReviews = gig.reviews.length;
      } else {
        gig.averageRating = 0;
        gig.totalReviews = 0;
      }

      // Count completed orders for this gig
      const completedOrders = await Order.countDocuments({
        gigId: gigId,
        status: "complete",
      });
      gig.totalOrders = completedOrders;

      await gig.save();
      return gig;
    } catch (error) {
      console.error("Error calculating gig metrics:", error);
      return null;
    }
  }

  /**
   * Update user's cached metrics
   */
  static async updateUserMetrics(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return null;

      // Calculate seller metrics
      const sellerMetrics = await this.calculateUserSellerRating(userId);

      // Calculate buyer metrics
      const buyerMetrics = await this.calculateUserBuyerRating(userId);

      // Update user with cached metrics
      const updateData = {
        "sellerMetrics.averageRating": sellerMetrics.averageRating,
        "sellerMetrics.totalReviews": sellerMetrics.totalReviews,
        "sellerMetrics.totalOrders": sellerMetrics.totalOrders,
        "sellerMetrics.lastUpdated": new Date(),
        "buyerMetrics.averageRating": buyerMetrics.averageRating,
        "buyerMetrics.totalOrders": buyerMetrics.totalOrders,
        "buyerMetrics.lastUpdated": new Date(),
      };

      console.log(`[RatingService] Updating metrics for user ${userId}`);
      console.log(`[RatingService] Calculated Seller Metrics:`, sellerMetrics);
      console.log(`[RatingService] Calculated Buyer Metrics:`, buyerMetrics);

      await User.findByIdAndUpdate(userId, updateData);
      console.log(`[RatingService] Metrics updated in DB for user ${userId}`);

      return {
        seller: sellerMetrics,
        buyer: buyerMetrics,
      };
    } catch (error) {
      console.error("Error updating user metrics:", error);
      return null;
    }
  }

  /**
   * Get comprehensive user ratings
   */
  static async getUserRatings(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return null;

      // Check if cached metrics are recent (less than 1 hour old)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const sellerCacheValid = user.sellerMetrics?.lastUpdated > oneHourAgo;
      const buyerCacheValid = user.buyerMetrics?.lastUpdated > oneHourAgo;

      let sellerMetrics, buyerMetrics;

      if (sellerCacheValid && user.sellerMetrics) {
        sellerMetrics = {
          averageRating: user.sellerMetrics.averageRating,
          totalReviews: user.sellerMetrics.totalReviews,
          totalOrders: user.sellerMetrics.totalOrders,
        };
      } else {
        sellerMetrics = await this.calculateUserSellerRating(userId);
      }

      if (buyerCacheValid && user.buyerMetrics) {
        buyerMetrics = {
          averageRating: user.buyerMetrics.averageRating,
          totalOrders: user.buyerMetrics.totalOrders,
        };
      } else {
        buyerMetrics = await this.calculateUserBuyerRating(userId);
      }

      // Update cache if needed
      if (!sellerCacheValid || !buyerCacheValid) {
        await this.updateUserMetrics(userId);
      }

      return {
        seller: sellerMetrics,
        buyer: buyerMetrics,
      };
    } catch (error) {
      console.error("Error getting user ratings:", error);
      return null;
    }
  }

  /**
   * Add review to gig and update all related metrics
   */
  static async addReviewToGig(gigId, reviewData) {
    try {
      const gig = await Gig.findById(gigId);
      if (!gig) throw new Error("Gig not found");

      // Add review to gig
      gig.reviews.push({
        buyer: reviewData.buyerId,
        rating: reviewData.rating,
        comment: reviewData.comment,
        order: reviewData.orderId,
        createdAt: new Date(),
      });

      await gig.save();

      // Recalculate gig metrics
      await this.calculateGigMetrics(gigId);

      // Update seller's cached metrics
      await this.updateUserMetrics(gig.seller);

      return gig;
    } catch (error) {
      console.error("Error adding review to gig:", error);
      throw error;
    }
  }
}

module.exports = RatingService;
