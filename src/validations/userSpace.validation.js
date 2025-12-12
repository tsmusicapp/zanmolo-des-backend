const Joi = require('joi');

const getSpace = {};

const addSpace = {
  body: Joi.object().keys({
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    creationOccupation: Joi.array().items(Joi.string()).required(),
    hiring: Joi.string().required(),
    // Removed music-related validations
    websiteUrl: Joi.string(),
    companyOrStudio: Joi.string(), // tidak required
    aboutMe: Joi.string().required(),
    softwareTool: Joi.array().items(Joi.string()),
    // Removed commented social media fields
    x: Joi.string(),
    facebook: Joi.string(),
    businessOccupation: Joi.string(),
    location: Joi.string(),
    state: Joi.string(),
    city: Joi.string(),
    profilePicture: Joi.string(),
    address: Joi.string().required(),
    myServices: Joi.array().items(Joi.string()),
    // Derived metrics: allow but strip if provided
    orderQuantity: Joi.any().strip(),
    sellerReviews: Joi.any().strip(),
    orderRating: Joi.any().strip(),
    buyerQuantity: Joi.any().strip(),
    buyerRating: Joi.any().strip(),
  }),
};

const editSpace = {};

const updateSpace = {
  body: Joi.object().keys({
    firstName: Joi.string(),
    lastName: Joi.string(),
    creationOccupation: Joi.array().items(Joi.string()),
    businessOccupation: Joi.string(),
    hiring: Joi.string(),
    // Removed music-related validations
    companyOrStudio: Joi.string(),
    websiteUrl: Joi.string(),
    aboutMe: Joi.string(),
    softwareTool: Joi.array().items(Joi.string()),
    // Removed commented social media fields
    x: Joi.string(),
    facebook: Joi.string(),
    location: Joi.string(),
    state: Joi.string(),
    city: Joi.string(),
    profilePicture: Joi.string(),
    address: Joi.string(),
    myServices: Joi.array().items(Joi.string()),
    // Derived metrics: allow but strip to avoid 400 and prevent manual override
    orderQuantity: Joi.any().strip(),
    sellerReviews: Joi.any().strip(),
    orderRating: Joi.any().strip(),
    buyerQuantity: Joi.any().strip(),
    buyerRating: Joi.any().strip(),
  }),
};

module.exports = {
  getSpace,
  addSpace,
  editSpace,
  updateSpace,
};
