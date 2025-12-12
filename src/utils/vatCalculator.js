/**
 * VAT Calculator for Music Platform (Backend)
 * 
 * VAT Rate: 4% (for the user's state)
 * Three-way split:
 * - Buyer: 33% of VAT (1.32% of order amount)
 * - Seller: 33% of VAT (1.32% of order amount) 
 * - Platform: 34% of VAT (1.36% of order amount)
 */

/**
 * Calculate VAT breakdown for buyer checkout
 * @param {number} orderAmount - The original order amount
 * @returns {object} VAT breakdown showing what buyer pays
 */
const calculateBuyerVAT = (orderAmount) => {
  const vatRate = 0.04; // 4%
  const totalVAT = orderAmount * vatRate;
  
  // Three-way split percentages
  const buyerVATPercent = 0.0132; // 1.32%
  const sellerVATPercent = 0.0132; // 1.32%
  const platformVATPercent = 0.0136; // 1.36%
  
  const buyerVAT = orderAmount * buyerVATPercent;
  const sellerVAT = orderAmount * sellerVATPercent;
  const platformVAT = orderAmount * platformVATPercent;
  
  const buyerTotal = orderAmount + buyerVAT;
  const sellerPayout = orderAmount - sellerVAT;
  
  return {
    orderAmount: parseFloat(orderAmount.toFixed(2)),
    vatRate: vatRate,
    totalVAT: parseFloat(totalVAT.toFixed(2)),
    buyerVAT: parseFloat(buyerVAT.toFixed(2)),
    sellerVAT: parseFloat(sellerVAT.toFixed(2)),
    platformVAT: parseFloat(platformVAT.toFixed(2)),
    buyerTotal: parseFloat(buyerTotal.toFixed(2)),
    sellerPayout: parseFloat(sellerPayout.toFixed(2)),
    platformFee: parseFloat(platformVAT.toFixed(2))
  };
};

/**
 * Calculate VAT breakdown for seller payout
 * @param {number} orderAmount - The original order amount
 * @returns {object} VAT breakdown showing what seller receives
 */
const calculateSellerVAT = (orderAmount) => {
  const vatRate = 0.04; // 4%
  const totalVAT = orderAmount * vatRate;
  
  // Three-way split percentages
  const buyerVATPercent = 0.0132; // 1.32%
  const sellerVATPercent = 0.0132; // 1.32%
  const platformVATPercent = 0.0136; // 1.36%
  
  const buyerVAT = orderAmount * buyerVATPercent;
  const sellerVAT = orderAmount * sellerVATPercent;
  const platformVAT = orderAmount * platformVATPercent;
  
  const buyerTotal = orderAmount + buyerVAT;
  const sellerPayout = orderAmount - sellerVAT;
  
  return {
    orderAmount: parseFloat(orderAmount.toFixed(2)),
    vatRate: vatRate,
    totalVAT: parseFloat(totalVAT.toFixed(2)),
    buyerVAT: parseFloat(buyerVAT.toFixed(2)),
    sellerVAT: parseFloat(sellerVAT.toFixed(2)),
    platformVAT: parseFloat(platformVAT.toFixed(2)),
    buyerTotal: parseFloat(buyerTotal.toFixed(2)),
    sellerPayout: parseFloat(sellerPayout.toFixed(2)),
    platformFee: parseFloat(platformVAT.toFixed(2))
  };
};

/**
 * Calculate seller payout with new fee structure
 * Seller receives: 60% - 1.33% (VAT)
 * @param {number} sellingPrice - The selling price of the item
 * @returns {object} Seller payout breakdown
 */
const calculateSellerPayout = (sellingPrice) => {
  const sellerPercentage = 0.60; // 60% of selling price
  const sellerVATPercent = 0.0133; // 1.33% VAT on selling price
  
  const grossSellerAmount = sellingPrice * sellerPercentage;
  const sellerVAT = sellingPrice * sellerVATPercent;
  
  const netSellerPayout = grossSellerAmount - sellerVAT;
  
  return {
    sellingPrice: parseFloat(sellingPrice.toFixed(2)),
    grossSellerAmount: parseFloat(grossSellerAmount.toFixed(2)),
    sellerVAT: parseFloat(sellerVAT.toFixed(2)),
    netSellerPayout: parseFloat(netSellerPayout.toFixed(2)),
    breakdown: {
      original: sellingPrice,
      sellerPercentage: sellerPercentage,
      grossAmount: grossSellerAmount,
      sellerVAT: sellerVAT,
      netPayout: netSellerPayout
    }
  };
};

/**
 * Calculate VAT breakdown for platform fees
 * @param {number} orderAmount - The original order amount
 * @returns {object} VAT breakdown showing platform fees
 */
const calculatePlatformVAT = (orderAmount) => {
  const vatRate = 0.04; // 4%
  const totalVAT = orderAmount * vatRate;
  
  // Three-way split percentages
  const buyerVATPercent = 0.0132; // 1.32%
  const sellerVATPercent = 0.0132; // 1.32%
  const platformVATPercent = 0.0136; // 1.36%
  
  const buyerVAT = orderAmount * buyerVATPercent;
  const sellerVAT = orderAmount * sellerVATPercent;
  const platformVAT = orderAmount * platformVATPercent;
  
  const buyerTotal = orderAmount + buyerVAT;
  const sellerPayout = orderAmount - sellerVAT;
  
  return {
    orderAmount: parseFloat(orderAmount.toFixed(2)),
    vatRate: vatRate,
    totalVAT: parseFloat(totalVAT.toFixed(2)),
    buyerVAT: parseFloat(buyerVAT.toFixed(2)),
    sellerVAT: parseFloat(sellerVAT.toFixed(2)),
    platformVAT: parseFloat(platformVAT.toFixed(2)),
    buyerTotal: parseFloat(buyerTotal.toFixed(2)),
    sellerPayout: parseFloat(sellerPayout.toFixed(2)),
    platformFee: parseFloat(platformVAT.toFixed(2))
  };
};

module.exports = {
  calculateBuyerVAT,
  calculateSellerVAT,
  calculatePlatformVAT,
  calculateSellerPayout
};
