const Joi = require('joi');

const generateAutofill = {
  body: Joi.object().keys({
    title: Joi.string().required().min(3).max(200).messages({
      'string.empty': 'Title is required',
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title cannot exceed 200 characters',
      'any.required': 'Title is required (minimum 3 characters)'
    }),
    category: Joi.string().max(100).optional().allow(''),
    subcategory: Joi.string().max(100).optional().allow(''),
    workImages: Joi.array().items(Joi.string().uri()).max(10).optional(),
    contextHint: Joi.string().optional().allow('') // Removed max length requirement
  }),
};

module.exports = {
  generateAutofill
};
