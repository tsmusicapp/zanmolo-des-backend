const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const saleSchema = new mongoose.Schema(
    {
        assetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ShareMusicAsset", // Keep same reference for backward compatibility
            required: true
        },
        OwnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        buyerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        buyer: {
            type: String,
            required: true
        },
        creatorName: {
            type: String,
            required: true
        },
        assetTitle: {
            type: String,
            required: true
        },
        assetPrice: {
            type: Number,
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        totalAmount: {
            type: Number,
            required: true
        },
        paymentMethod: {
            type: String,
            enum: ['paypal', 'stripe', 'card'],
            default: 'paypal'
        },
        paymentId: {
            type: String,
            required: false
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'refunded'],
            default: 'completed'
        },
        downloadCount: {
            type: Number,
            default: 0
        },
        downloadLimit: {
            type: Number,
            default: 10 // Max downloads allowed
        },
        downloadUrls: [{
            url: String,
            expiresAt: Date,
            createdAt: { type: Date, default: Date.now }
        }],
        created_at: {
            type: Date,
            default: Date.now
        },

    },
    { timestamps: true }
);

module.exports = mongoose.model('Sale', saleSchema);

// add plugin that converts mongoose to json
saleSchema.plugin(toJSON);
saleSchema.plugin(paginate);

/**
 * @typedef Sale
 */
const Sale = mongoose.model('Sale', saleSchema);

module.exports = Sale;
