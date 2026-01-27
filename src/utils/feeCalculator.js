/**
 * Fee calculation utilities for order payments
 * Based on the fee structure:
 * - Buyer pays: Order amount + 8% + $2 flat fee
 * - Seller receives: Order amount - 10% - 2.9% (Square processing fee)
 */

/**
 * Calculate buyer payment amount (what buyer pays)
 * @param {number} orderAmount - The original order amount
 * @returns {object} Payment breakdown for buyer
 */
const calculateBuyerPayment = (orderAmount) => {
  const platformFeePercent = 0.08; // 8%
  const flatFee = 2; // $2 flat fee
  const vatPercent = 0; // 0% VAT

  const platformFee = orderAmount * platformFeePercent;
  const vatAmount = orderAmount * vatPercent;
  const totalAmount = orderAmount + platformFee + flatFee + vatAmount;

  return {
    orderAmount: parseFloat(orderAmount.toFixed(2)),
    platformFee: parseFloat(platformFee.toFixed(2)),
    flatFee: flatFee,
    vatAmount: parseFloat(vatAmount.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    breakdown: {
      original: orderAmount,
      platformFee: platformFee,
      flatFee: flatFee,
      vatAmount: vatAmount,
      total: totalAmount,
    },
  };
};

/**
 * Calculate seller payout amount (what seller receives)
 * @param {number} orderAmount - The original order amount
 * @returns {object} Payout breakdown for seller
 */
const calculateSellerPayout = (orderAmount) => {
  const platformFeePercent = 0.1; // 10%
  const vatPercent = 0; // 0% VAT
  // Note: Stripe processing fees are now charged on withdrawal, not on order completion

  const platformFee = orderAmount * platformFeePercent;
  const vatAmount = orderAmount * vatPercent;
  const totalFees = platformFee + vatAmount;
  const netAmount = orderAmount - totalFees;

  return {
    orderAmount: parseFloat(orderAmount.toFixed(2)),
    platformFee: parseFloat(platformFee.toFixed(2)),
    squareProcessingFee: 0, // No longer charged on order completion
    vatAmount: parseFloat(vatAmount.toFixed(2)),
    totalFees: parseFloat(totalFees.toFixed(2)),
    netAmount: parseFloat(netAmount.toFixed(2)),
    breakdown: {
      original: orderAmount,
      platformFee: platformFee,
      squareProcessingFee: 0,
      vatAmount: vatAmount,
      totalFees: totalFees,
      net: netAmount,
    },
  };
};

/**
 * Calculate complete fee breakdown for an order
 * @param {number} orderAmount - The original order amount
 * @returns {object} Complete fee breakdown
 */
const calculateOrderFees = (orderAmount) => {
  const buyerPayment = calculateBuyerPayment(orderAmount);
  const sellerPayout = calculateSellerPayout(orderAmount);

  // Calculate platform profit (VAT is shared between buyer and seller)
  const platformProfit =
    buyerPayment.platformFee + buyerPayment.flatFee - sellerPayout.platformFee;

  return {
    orderAmount: parseFloat(orderAmount.toFixed(2)),
    buyer: buyerPayment,
    seller: sellerPayout,
    platform: {
      profit: parseFloat(platformProfit.toFixed(2)),
      breakdown: {
        fromBuyer: buyerPayment.platformFee + buyerPayment.flatFee,
        toSeller: sellerPayout.platformFee,
        net: platformProfit,
      },
    },
  };
};

/**
 * Validate fee calculation with example
 * For $100 order:
 * - Buyer pays: $100 + $8 + $2 + $1.32 = $111.32
 * - Seller receives: $100 - $10 - $1.32 = $88.68 (Stripe fees charged on withdrawal)
 */
const validateFeeCalculation = () => {
  const testAmount = 100;
  const result = calculateOrderFees(testAmount);

  console.log("Fee Calculation Validation for $100 order:");
  console.log("Buyer pays:", result.buyer.totalAmount); // Should be $111.32
  console.log("Seller receives:", result.seller.netAmount); // Should be $88.68
  console.log("Platform profit:", result.platform.profit); // Should be $0.10

  return result;
};

module.exports = {
  calculateBuyerPayment,
  calculateSellerPayout,
  calculateOrderFees,
  validateFeeCalculation,
};
