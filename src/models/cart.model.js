const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const cartSchema = new mongoose.Schema(
    {
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        cartItems: [
            {
                assetId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "ShareMusicAsset",
                    required: true,
                },
                paid: {
                    type: Boolean,
                    default: false
                },
                quantity: {
                    type: Number,
                    required: true,
                },
            },
        ],
    },
    { timestamps: true }
); // includes createdAt and updatedAt fields

// module.exports = mongoose.model('Cart', cartSchema);

// add plugin that converts mongoose to json
cartSchema.plugin(toJSON);
cartSchema.plugin(paginate);

/**
 * @typedef Job
 */
const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
