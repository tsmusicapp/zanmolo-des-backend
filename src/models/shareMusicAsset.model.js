const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const shareMusicAssetSchema = new mongoose.Schema(
  {
    // Generic asset fields (replacing music-specific fields)
    title: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, default: "" },
    isFree: { type: Boolean, default: false }, // Flag for free assets
    personalLicensePrice: { type: Number, required: true },
    commercialLicensePrice: { type: Number, required: true },
    extendedCommercialPrice: { type: Number, default: 0 },
    gameEnginePrice: { type: Number, default: 0 },
    broadcastFilmPrice: { type: Number, default: 0 },
    extendedRedistributionPrice: { type: Number, default: 0 },
    educationPrice: { type: Number, default: 0 },
    assetImages: { type: [String], required: true }, // Array of image URLs
    description: { type: String, required: true },
    embeds: { type: String, default: "" }, // YouTube preview or other embeds
    uploadAsset: { type: String, required: true }, // Main asset file (ZIP)
    fileSize: { type: Number, default: 0 },
    tags: { type: [String], required: true, minlength: 4, maxlength: 10 },
    softwareTools: { type: [String], default: [] }, // Optional, 1-10 tools
    additionalInformation: { type: String, default: "" }, // AI custom instructions or additional info
    
    // Keep some fields for backward compatibility
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
    },
    views: {
      type: Number,
      default: 0,
    },
    comments: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        comment: {
          type: String,
          required: true,
        },
        userName: {
          type: String,
          required: true,
        },  
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
); // includes createdAt and updatedAt fields

module.exports = mongoose.model("ShareMusicAsset", shareMusicAssetSchema);

// add plugin that converts mongoose to json
shareMusicAssetSchema.plugin(toJSON);
shareMusicAssetSchema.plugin(paginate);

/**
 * @typedef Job
 */
const ShareMusicAsset = mongoose.model(
  "ShareMusicAsset",
  shareMusicAssetSchema
);

module.exports = ShareMusicAsset;
