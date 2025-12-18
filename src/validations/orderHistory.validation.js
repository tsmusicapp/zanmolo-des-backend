const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getOrderHistory = {
  query: Joi.object().keys({
    search: Joi.string().optional(),
    status: Joi.string().valid('inprogress', 'accepted', 'delivered', 'revision', 'cancel', 'complete').optional(),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().optional(),
    minAmount: Joi.number().min(0).optional(),
    maxAmount: Joi.number().min(0).optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
  }),
};

const getOrderDetails = {
  params: Joi.object().keys({
    orderId: Joi.string().custom(objectId).required(),
  }),
};

const generateOrderDownloadUrl = {
  params: Joi.object().keys({
    orderId: Joi.string().custom(objectId).required(),
    fileId: Joi.string().custom(objectId).required(),
  }),
};

const downloadOrderFile = {
  params: Joi.object().keys({
    orderId: Joi.string().custom(objectId).required(),
    fileId: Joi.string().custom(objectId).required(),
    token: Joi.string().required(),
  }),
};

module.exports = {
  getOrderHistory,
  getOrderDetails,
  generateOrderDownloadUrl,
  downloadOrderFile,
};
