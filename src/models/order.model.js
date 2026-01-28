const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");
const { ObjectId } = require("mongodb");

const orderSchema = mongoose.Schema(
  {
    // Legacy fields for music orders
    musicIds: [
      {
        type: String,
      },
    ],
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    chat_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
    },

    // Gig order fields
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    gig: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
    },
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
    },
    packageType: {
      type: String,
      enum: ["basic", "standard", "premium"],
    },
    packageDetails: {
      title: String,
      description: String,
      price: Number,
      deliveryTime: Number,
      revisions: Number,
      features: [String],
    },
    extras: [
      {
        extraId: String,
        title: String,
        price: Number,
        additionalTime: Number,
      },
    ],
    requirements: {
      type: String,
    },
    expectedDeliveryDate: {
      type: Date,
    },

    // Order type
    type: {
      type: String,
      enum: ["music_order", "gig_order"],
      default: "music_order",
    },

    title: {
      type: String,
    },
    startTime: {
      type: Date,
      default: Date.now(),
    },
    completedAt: {
      type: Date,
    },
    description: {
      type: String,
    },
    details: {
      type: String,
    },
    delivery_time: {
      type: Number,
    },
    deliveryTime: {
      type: Number, // New field for gig orders
    },
    price: {
      type: Number,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "pending_payment",
        "active",
        "inprogress",
        "accepted",
        "delivered",
        "revision",
        "cancel",
        "complete",
      ],
      default: "active",
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["paypal", "square", "stripe", "card"],
      default: "stripe",
    },
    paymentId: {
      type: String,
    },
    paymentDetails: {
      method: String,
      paymentIntentId: String,
      amount: Number,
      currency: String,
      status: String,
    },
    deliveryFiles: [
      {
        filename: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
        downloadCount: { type: Number, default: 0 },
      },
    ],
    downloadUrls: [
      {
        url: String,
        expiresAt: Date,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    revison_message: {
      type: String,
    },
    cancel_message: {
      type: String,
    },
    rating: {
      type: Number,
    },
    review: {
      type: String,
    },
    // New dual rating system
    buyerRating: {
      type: Number,
      min: 1,
      max: 5,
    },
    buyerReview: {
      type: String,
      minlength: 10,
      maxlength: 200,
    },
    buyerReviewAt: {
      type: Date,
    },
    buyerReviewAt: {
      type: Date,
    },
    sellerReply: {
      type: String,
      minlength: 10,
      maxlength: 500,
    },
    sellerRepliedAt: {
      type: Date,
    },
    tip: {
      type: Number,
    },
    createdBy: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    // Extension requests for delivery time
    extensions: [
      {
        days: { type: Number, required: true },
        status: {
          type: String,
          enum: ["pending", "accepted", "declined"],
          default: "pending",
        },
        reason: { type: String },
        requestedBy: { type: ObjectId, ref: "User", required: true },
        requestedAt: { type: Date, default: Date.now },
        decidedBy: { type: ObjectId, ref: "User" },
        decidedAt: { type: Date },
      },
    ],
    // Cancellation requests (approval flow)
    cancellations: [
      {
        reason: { type: String },
        status: {
          type: String,
          enum: ["pending", "accepted", "declined", "admin_review"],
          default: "pending",
        },
        requestedBy: { type: ObjectId, ref: "User", required: true },
        requestedAt: { type: Date, default: Date.now },
        decidedBy: { type: ObjectId, ref: "User" },
        decidedAt: { type: Date },
        declinedBy: { type: ObjectId, ref: "User" },
        declinedByName: { type: String },
        adminReason: { type: String },
        attachments: [
          {
            filename: { type: String },
            originalName: { type: String },
            url: { type: String },
            size: { type: Number },
            mimetype: { type: String },
            uploadedAt: { type: Date, default: Date.now },
          },
        ],
      },
    ],
    // Refund tracking
    refundEligible: {
      type: Boolean,
      default: true,
    },
    refundProcessed: {
      type: Boolean,
      default: false,
    },
    refundAmount: {
      type: Number,
    },
    refundProcessedAt: {
      type: Date,
    },
    // Activity log for tracking order lifecycle events
    activities: [
      {
        action: { type: String, required: true }, // e.g., created, status_changed, accepted, declined, review_set
        by: { type: ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
        note: { type: String },
        fromStatus: { type: String },
        toStatus: { type: String },
        meta: { type: mongoose.Schema.Types.Mixed },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// add plugin that converts mongoose to json
orderSchema.plugin(toJSON);
orderSchema.plugin(paginate);

// Middleware to handle balance updates when order status changes
orderSchema.post("save", async function (doc) {
  // Only process if status changed to 'complete'
  if (this.isModified("status") && doc.status === "complete") {
    try {
      const balanceHelper = require("../utils/balanceHelper");

      // Add balance to the service provider (createdBy - musician/freelancer)
      await balanceHelper.addOrderCompletionBalance(
        doc.createdBy,
        doc.totalAmount || doc.price,
        doc._id,
        `Payment for completed order: ${doc.title || "Order #" + doc._id}`,
      );

      console.log(
        `✅ Balance added to user ${doc.createdBy} for completed order ${doc._id}`,
      );
    } catch (error) {
      console.error("❌ Error adding balance for completed order:", error);
    }
  }
});

/**
 * @typedef Order
 */
const Order = mongoose.model("Orders", orderSchema);

module.exports = Order;
