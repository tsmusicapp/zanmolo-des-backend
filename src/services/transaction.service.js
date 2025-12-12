const httpStatus = require('http-status');
const { Transaction, User } = require('../models');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');

/**
 * Create a new transaction
 * @param {Object} transactionData - Transaction data
 * @returns {Promise<Transaction>}
 */
const createTransaction = async (transactionData) => {
  const transaction = await Transaction.create(transactionData);
  return transaction;
};

/**
 * Get user's transaction history with pagination
 * @param {string} userId - User ID
 * @param {Object} filter - Filter options
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getUserTransactions = async (userId, filter, options) => {
  const queryFilter = { userId, ...filter };
  
  try {
    // Manual pagination
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 10;
    const skip = (page - 1) * limit;
    
    console.log('Getting transactions for user:', userId, 'filter:', queryFilter);
    
    // Get total count
    const totalResults = await Transaction.countDocuments(queryFilter);
    console.log('Total transactions found:', totalResults);
    
    // Get transactions without complex populate to avoid errors
    const transactions = await Transaction.find(queryFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    console.log('Transactions retrieved:', transactions.length);
    
    const totalPages = Math.ceil(totalResults / limit);
    
    return {
      results: transactions,
      page: page,
      limit: limit,
      totalPages,
      totalResults,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null
    };
  } catch (error) {
    console.error('Error in getUserTransactions:', error);
    throw error;
  }
};

/**
 * Update user balance and create transaction record
 * @param {string} userId - User ID
 * @param {number} amount - Amount to add/subtract
 * @param {string} type - Transaction type
 * @param {string} description - Transaction description
 * @param {Object} additionalData - Additional transaction data
 * @returns {Promise<Object>}
 */
const updateUserBalance = async (userId, amount, type, description, additionalData = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find user and update balance
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    const currentBalance = user.balance || 0;
    const newBalance = currentBalance + amount;

    if (newBalance < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient balance');
    }

    // Update user balance
    await User.findByIdAndUpdate(
      userId,
      { balance: newBalance },
      { session, new: true }
    );

    // Create transaction record
    const transactionData = {
      userId,
      type,
      amount: Math.abs(amount),
      description,
      status: 'completed',
      netAmount: Math.abs(amount),
      processedAt: new Date(),
      ...additionalData
    };

    const transaction = await Transaction.create([transactionData], { session });

    await session.commitTransaction();
    session.endSession();

    return {
      transaction: transaction[0],
      newBalance,
      previousBalance: currentBalance
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

/**
 * Process withdrawal request
 * @param {string} userId - User ID  
 * @param {number} amount - Amount to withdraw
 * @param {Object} withdrawalData - Additional withdrawal data
 * @returns {Promise<Object>}
 */
const processWithdrawal = async (userId, amount, withdrawalData = {}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const currentBalance = user.balance || 0;
  if (amount > currentBalance) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient balance for withdrawal');
  }

  if (amount < 1) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Minimum withdrawal amount is $1');
  }

  // Check if user has Stripe account connected
  if (!user.stripeAccountId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please connect your Stripe account first');
  }

  // Create withdrawal transaction (initially pending)
  const result = await updateUserBalance(
    userId,
    -amount, // Negative amount for withdrawal
    'withdrawal',
    `Withdrawal request for $${amount}`,
    {
      status: 'pending',
      ...withdrawalData
    }
  );

  return result;
};

/**
 * Get user's current balance
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
const getUserBalance = async (userId) => {
  const user = await User.findById(userId).select('balance');
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  return user.balance || 0;
};

/**
 * Get transaction statistics for user
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
const getTransactionStats = async (userId) => {
  const stats = await Transaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalPurchases: 0,
    totalSales: 0,
    totalCommissions: 0,
    transactionCount: stats.reduce((sum, stat) => sum + stat.count, 0)
  };

  stats.forEach(stat => {
    switch (stat._id) {
      case 'deposit':
        result.totalDeposits = stat.totalAmount;
        break;
      case 'withdrawal':
        result.totalWithdrawals = stat.totalAmount;
        break;
      case 'purchase':
        result.totalPurchases = stat.totalAmount;
        break;
      case 'sale':
        result.totalSales = stat.totalAmount;
        break;
      case 'commission':
        result.totalCommissions = stat.totalAmount;
        break;
    }
  });

  return result;
};

module.exports = {
  createTransaction,
  getUserTransactions,
  updateUserBalance,
  processWithdrawal,
  getUserBalance,
  getTransactionStats
};
