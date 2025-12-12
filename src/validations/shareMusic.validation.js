const Joi = require('joi');
const { objectId } = require('./custom.validation');

const shareAsset = {
  body: Joi.object({
    title: Joi.string().required(),
    category: Joi.string().required(),
    subcategory: Joi.string().allow('').optional(),
    isFree: Joi.boolean().optional(),
    personalLicensePrice: Joi.number().min(0).required(),
    commercialLicensePrice: Joi.number().min(0).required(),
    extendedCommercialPrice: Joi.number().min(0).optional(),
    gameEnginePrice: Joi.number().min(0).optional(),
    broadcastFilmPrice: Joi.number().min(0).optional(),
    extendedRedistributionPrice: Joi.number().min(0).optional(),
    educationPrice: Joi.number().min(0).optional(),
    assetImages: Joi.array().items(Joi.string()).min(1).max(10).required(),
    description: Joi.string().min(50).max(3000).required(),
    embeds: Joi.string().allow('').optional(),
    uploadAsset: Joi.string().required(),
    fileSize: Joi.number().min(0).optional(),
    tags: Joi.array().items(Joi.string()).min(4).max(10).required(),
    softwareTools: Joi.array().items(Joi.string()).min(0).max(10).optional(),
    status: Joi.string().valid('draft', 'published', 'archived').optional(),
  }),
};

const getAssets = {};

const shareCreation = {
  body: Joi.object({
    // Work type
    workType: Joi.string().valid('music', 'design').default('music'),
    
    // Common fields
    title: Joi.string().required().messages({ 'any.required': 'Title is required.' }),
    description: Joi.string().required().messages({ 'any.required': 'Description is required.' }),
    tags: Joi.array().items(Joi.string()).optional().default([]),
    softwareTool: Joi.array().items(Joi.string()).optional().default([]),
    workImages: Joi.array().items(Joi.string()).optional().default([]),
    embeds: Joi.string().optional().allow(''),
    
    // Design-specific fields
    category: Joi.string().when('workType', {
      is: 'design',
      then: Joi.required().messages({ 'any.required': 'Category is required for design work.' }),
      otherwise: Joi.optional().allow('')
    }),
    subcategory: Joi.string().when('workType', {
      is: 'design',
      then: Joi.required().messages({ 'any.required': 'Subcategory is required for design work.' }),
      otherwise: Joi.optional().allow('')
    }),
    
    // Music-specific fields (for backward compatibility)
    musicName: Joi.string().optional().allow(''),
    myRole: Joi.array()
      .items(Joi.string().valid('composer', 'lyricist', 'arranger', 'producer'))
      .optional(),
    singerName: Joi.string().optional().allow(''),
    publisher: Joi.string().optional().allow(''),
    songLanguage: Joi.string().optional().allow(''),
    musicUsage: Joi.array().items(Joi.string()).optional().allow(''),
    musicStyle: Joi.string().optional().allow(''),
    musicMood: Joi.string().optional().allow(''),
    musicImage: Joi.string().optional().allow(''),
    music: Joi.string().optional().allow(''),
    musicLyric: Joi.string().optional().allow(''),
    musicPlaybackBackground: Joi.string().optional().allow(''),
    musicInstrument: Joi.string().optional().allow(''),
  }),
};

const getCreation = {};

module.exports = {
  shareAsset,
  getAssets,
  shareCreation,
  getCreation,
};
