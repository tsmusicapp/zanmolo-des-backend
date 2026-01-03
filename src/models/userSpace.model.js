const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { toJSON, paginate } = require('./plugins');
const { roles } = require('../config/roles');

// firstName: Joi.string().required(),
// lastName: Joi.string().required(),
// occupation: Joi.string().required(),
// musicCultureRegion: Joi.array().items(Joi.string()).required(),
// hiring: Joi.array().items(Joi.string()).required(),
// company: Joi.string().required(),
// location: Joi.string().required(),
// state: Joi.string().required(),
// city: Joi.string().required(),
// websiteUrl: Joi.string(),
// aboutMe: Joi.string().required(),
// softwareTool: Joi.string(),
// profilePicture: Joi.string(),

const userSpaceSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    creationOccupation: {
      type: [String],
      required: true,
    },
    businessOccupation: {
      type: String,
      required: false,
    },
    hiring: {
      type: String,
    },
    address: {
      type: String,
      required: true,
    },
    // Removed music-related fields
    companyOrStudio: {
      type: String,
      required: false,
    },
    websiteUrl: {
      type: String,
    },
    aboutMe: {
      type: String,
      required: true,
    },
    softwareTool: {
      type: [String],
    },
    myServices: {
      type: [String],
    },
    // Removed commented social media fields
    x: {
      type: String,
    },
    facebook: {
      type: String,
    },
    linkedin: {
      type: String,
    },
    instagram: {
      type: String,
    },
    location: {
      type: String,
    },
    state: {
      type: String,
    },
    city: {
      type: String,
    },
    profilePicture: {
      type: String,
      required: true,
    },
    coverUrl: {
      type: String,
      required: false,
    },
    coverCrop: {
      type: String,
      required: false,
    },
    createdBy: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
userSpaceSchema.plugin(toJSON);
userSpaceSchema.plugin(paginate);

/**
 * @typedef UserSpace
 */
const UserSpace = mongoose.model('UserSpace', userSpaceSchema);

module.exports = UserSpace;
