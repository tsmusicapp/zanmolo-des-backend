const Joi = require('joi');

const createPayment = {
  body: Joi.object().keys({
    sourceId: Joi.string().required(),
    amount: Joi.number().positive().required(),
    currency: Joi.string().length(3).default('USD'),
    buyerEmailAddress: Joi.string().email().optional(),
    note: Joi.string().max(500).optional()
  }),
};

const getPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().required(),
  }),
};

const listPayments = {
  query: Joi.object().keys({
    beginTime: Joi.string().optional(),
    endTime: Joi.string().optional(),
    sortOrder: Joi.string().valid('ASC', 'DESC').optional(),
    cursor: Joi.string().optional(),
    locationId: Joi.string().optional()
  }),
};

module.exports = {
  createPayment,
  getPayment,
  listPayments,
};
