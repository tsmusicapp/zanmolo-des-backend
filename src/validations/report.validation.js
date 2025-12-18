const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createBlogReport = {
  params: Joi.object().keys({
    blogId: Joi.string().custom(objectId),
  }),
  body: Joi.object().keys({
    reason: Joi.string().optional().trim().max(200),
    description: Joi.string().optional().trim().max(500),
  }),
};

const getReports = {
  query: Joi.object().keys({
    type: Joi.string().valid('user', 'music', 'lyrics', 'assets', 'job', 'blog'),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const deleteReport = {
  params: Joi.object().keys({
    reportId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createBlogReport,
  getReports,
  deleteReport,
};