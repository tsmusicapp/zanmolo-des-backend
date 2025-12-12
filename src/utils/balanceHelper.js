const { transactionService } = require('../services');
const { User, ShareMusicAsset } = require('../models');
const mongoose = require('mongoose');

/**
 * Add balance to user when they complete an order (musician gets paid)
 * @param {string} userId - Musician/service provider ID
 * @param {number} amount - Order amount
 * @param {string} orderId - Order ID
 * @param {string} description - Transaction description
 */
const addOrderCompletionBalance = async (userId, amount, orderId, description = '') => {
  try {
    // Use new fee structure: 10% platform fee + 2.9% Square processing fee
    const { calculateSellerPayout } = require('./feeCalculator');
    const sellerPayout = calculateSellerPayout(amount);

    const result = await transactionService.updateUserBalance(
      userId,
      sellerPayout.netAmount, // Positive amount (income) - what seller actually receives
      'sale',
      description || `Payment received for completed order`,
      {
        relatedOrderId: orderId,
        feeAmount: sellerPayout.totalFees,
        platformFee: sellerPayout.platformFee,
        squareProcessingFee: sellerPayout.squareProcessingFee,
        netAmount: sellerPayout.netAmount,
        metadata: {
          originalAmount: amount,
          platformFeePercent: 0.10, // 10%
          vatPercent: 0.0132, // 1.32% VAT
          note: 'Stripe processing fees now charged on withdrawal',
          feeBreakdown: sellerPayout.breakdown
        }
      }
    );

    return result;
  } catch (error) {
    console.error('Error adding order completion balance:', error);
    throw error;
  }
};

/**
 * Add balance to asset owner when someone purchases their music
 * @param {string} musicId - ShareMusicAsset ID
 * @param {string} purchaseId - Purchase ID
 * @param {number} amount - Purchase amount
 * @param {string} licenseType - 'personal' or 'commercial'
 */
const addPurchaseBalance = async (musicId, purchaseId, amount, licenseType = 'personal') => {
  try {
    // Get the music asset to find the owner
    const musicAsset = await ShareMusicAsset.findById(musicId).populate('createdBy');
    if (!musicAsset) {
      throw new Error('Music asset not found');
    }

    const ownerId = musicAsset.createdBy._id || musicAsset.createdBy;
    const platformFeePercent = 0.10; // 10% platform fee for music sales
    const platformFee = amount * platformFeePercent;
    const netAmount = amount - platformFee;

    const result = await transactionService.updateUserBalance(
      ownerId,
      netAmount, // Positive amount (income)
      'sale',
      `Sale of "${musicAsset.songName}" (${licenseType} license)`,
      {
        relatedPurchaseId: purchaseId,
        feeAmount: platformFee,
        platformFee: platformFee,
        netAmount: netAmount,
        metadata: {
          musicAssetId: musicId,
          musicTitle: musicAsset.songName,
          licenseType: licenseType,
          originalAmount: amount,
          platformFeePercent: platformFeePercent
        }
      }
    );

    return result;
  } catch (error) {
    console.error('Error adding purchase balance:', error);
    throw error;
  }
};

/**
 * Deduct balance when user makes a purchase (buyer pays)
 * @param {string} userId - Buyer ID
 * @param {number} amount - Purchase amount
 * @param {string} purchaseId - Purchase ID
 * @param {string} musicTitle - Music title
 */
const deductPurchaseBalance = async (userId, amount, purchaseId, musicTitle = '') => {
  try {
    const result = await transactionService.updateUserBalance(
      userId,
      -amount, // Negative amount (expense)
      'purchase',
      `Purchase of "${musicTitle}"`,
      {
        relatedPurchaseId: purchaseId,
        netAmount: amount
      }
    );

    return result;
  } catch (error) {
    console.error('Error deducting purchase balance:', error);
    throw error;
  }
};

/**
 * Add commission to referrer or collaborator
 * @param {string} userId - User who gets commission
 * @param {number} amount - Commission amount
 * @param {string} description - Commission description
 * @param {Object} metadata - Additional metadata
 */
const addCommissionBalance = async (userId, amount, description, metadata = {}) => {
  try {
    const result = await transactionService.updateUserBalance(
      userId,
      amount, // Positive amount (income)
      'commission',
      description,
      {
        netAmount: amount,
        metadata: metadata
      }
    );

    return result;
  } catch (error) {
    console.error('Error adding commission balance:', error);
    throw error;
  }
};

module.exports = {
  addOrderCompletionBalance,
  addPurchaseBalance,
  deductPurchaseBalance,
  addCommissionBalance
};
