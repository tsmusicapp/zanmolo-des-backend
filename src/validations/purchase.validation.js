const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getPurchaseHistory = {
  query: Joi.object().keys({
    search: Joi.string().optional(),
    status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').optional(),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().optional(),
    minAmount: Joi.number().min(0).optional(),
    maxAmount: Joi.number().min(0).optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
  }),
};

const getPurchaseDetails = {
  params: Joi.object().keys({
    purchaseId: Joi.string().custom(objectId).required(),
  }),
};

const generateDownloadUrl = {
  params: Joi.object().keys({
    purchaseId: Joi.string().custom(objectId).required(),
  }),
};

const downloadPurchasedFile = {
  params: Joi.object().keys({
    purchaseId: Joi.string().custom(objectId).required(),
    token: Joi.string().required(),
  }),
};

const getSalesData = {
  query: Joi.object().keys({
    search: Joi.string().optional(),
    status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').optional(),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().optional(),
    minAmount: Joi.number().min(0).optional(),
    maxAmount: Joi.number().min(0).optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
  }),
};

module.exports = {
  getPurchaseHistory,
  getPurchaseDetails,
  generateDownloadUrl,
  downloadPurchasedFile,
  getSalesData,
};
