const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const gigSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    category: {
      type: String,
      required: true,
      enum: [
        // Music / Audio
        "music-production",
        "mixing-mastering",
        "songwriting",
        "vocal-recording",
        "beat-making",
        "lyrics-writing",
        "voice-over",
        "podcast-editing",
        "sound-design",
        "jingle-creation",
        "instruments",
        "composition",
        "vocals",
        "audio-engineering",
        
        // Design categories (MATCH FRONTEND EXACTLY)
        "Architecture Design Services",
        "Interior Design Services",
        "Product & Industrial Design Services",
        "Environment & Scene Design Services",
        "Vehicle & Hard-surface Design Services",
        "Props & Asset Creation Services",
        "3D Visualization & Rendering Services",
        "Animation & Video Design Services",
        
        "other",
      ],
    },
    subcategory: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      required: true,
      maxlength: 1200,
    },
    packages: {
      basic: {
        title: {
          type: String,
          required: true,
          maxlength: 50,
        },
        description: {
          type: String,
          required: true,
          maxlength: 300,
        },
        price: {
          type: Number,
          required: true,
          min: 5,
          max: 10000,
        },
        revisions: {
          type: Number,
          // required: true,
          min: 0,
          max: 10,
        },
        features: [
          {
            type: String,
            maxlength: 100,
          },
        ],
      },
      standard: {
        title: {
          type: String,
          maxlength: 50,
        },
        description: {
          type: String,
          maxlength: 300,
        },
        price: {
          type: Number,
          min: 5,
          max: 10000,
        },
        revisions: {
          type: Number,
          min: 0,
          max: 10,
        },
        features: [
          {
            type: String,
            maxlength: 100,
          },
        ],
      },
      premium: {
        title: {
          type: String,
          maxlength: 50,
        },
        description: {
          type: String,
          maxlength: 300,
        },
        price: {
          type: Number,
          min: 5,
          max: 10000,
        },
        revisions: {
          type: Number,
          min: 0,
          max: 10,
        },
        features: [
          {
            type: String,
            maxlength: 100,
          },
        ],
      },
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30,
      },
    ],
    videos: [
      {
        type: String,
        required: true,
      },
    ],
    referenceSongs: [
      {
        type: String,
      },
    ],
    referenceArtworks: [
      {
        type: String,
      },
    ],
    videoUrl: {
      type: String,
    },
    audioSamples: [
      {
        title: String,
        url: String,
        duration: Number,
      },
    ],
    requirements: {
      type: String,
      maxlength: 1000,
    },
    additionalInformation: {
      type: String,
      default: "",
    },
    deliveryContent: {
      deliveryTime: {
        type: String,
        default: "1 week"
      },
      revisionRounds: {
        type: Number,
        default: 2,
        min: 0,
        max: 10
      },
      deliverables: {
        type: Map,
        of: Boolean,
        default: {}
      },
      additionalNotes: {
        type: String,
        default: ""
      }
    },
    faq: [
      {
        question: {
          type: String,
          required: true,
          maxlength: 100,
        },
        answer: {
          type: String,
          required: true,
          maxlength: 300,
        },
      },
    ],
    images: {
      type: [String],
      default: [],
    },
    gigImages: {
      type: [String],
      default: [],
    },
    coverImageIndex: {
      type: Number,
      default: 0,
      min: 0,
    },
    gig_extras: [
      {
        title: {
          type: String,
          required: true,
          maxlength: 50,
        },
        description: {
          type: String,
          maxlength: 100,
        },
        price: {
          type: Number,
          required: true,
          min: 5,
          max: 1000,
        },
        additionalTime: {
          type: Number,
          default: 0, // additional days
        },
      },
    ],
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "denied"],
      default: "draft",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    reviews: [
      {
        buyer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        comment: {
          type: String,
          maxlength: 500,
        },
        order: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Order",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    searchKeywords: [
      {
        type: String,
        trim: true,
      },
    ],
    metadata: {
      lastModified: {
        type: Date,
        default: Date.now,
      },
      publishedAt: Date,
      pausedAt: Date,
      denialReason: String,
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better performance
gigSchema.index({ seller: 1 });
gigSchema.index({ status: 1 });
gigSchema.index({ category: 1 });
gigSchema.index({ subcategory: 1 });
gigSchema.index({ isActive: 1 });
gigSchema.index({ averageRating: -1 });
gigSchema.index({ totalOrders: -1 });
gigSchema.index({ createdAt: -1 });
gigSchema.index({ "packages.basic.price": 1 });
gigSchema.index({ tags: 1 });

// Text search index for title, description, and tags
gigSchema.index({
  title: "text",
  description: "text",
  tags: "text",
  searchKeywords: "text",
});

// Pre-save middleware to update metadata
gigSchema.pre("save", function (next) {
  this.metadata.lastModified = new Date();

  // Update published date when status changes to active
  if (
    this.isModified("status") &&
    this.status === "active" &&
    !this.metadata.publishedAt
  ) {
    this.metadata.publishedAt = new Date();
  }

  // Update paused date when status changes to paused
  if (this.isModified("status") && this.status === "paused") {
    this.metadata.pausedAt = new Date();
  }

  next();
});

// Pre-save middleware to calculate average rating
gigSchema.pre("save", function (next) {
  if (this.reviews && this.reviews.length > 0) {
    const totalRating = this.reviews.reduce(
      (sum, review) => sum + review.rating,
      0
    );
    this.averageRating = totalRating / this.reviews.length;
    this.totalReviews = this.reviews.length;
  }
  next();
});

// Static method to update gig stats
gigSchema.statics.updateStats = async function (gigId, stats) {
  return this.findByIdAndUpdate(gigId, { $inc: stats }, { new: true });
};

// Method to add review
gigSchema.methods.addReview = function (reviewData) {
  this.reviews.push(reviewData);
  return this.save();
};

// Method to check if user can review
gigSchema.methods.canUserReview = function (userId) {
  return !this.reviews.some(
    (review) => review.buyer.toString() === userId.toString()
  );
};

// Add plugin that converts mongoose to json
gigSchema.plugin(toJSON);
gigSchema.plugin(paginate);

/**
 * @typedef Gig
 */
const Gig = mongoose.model("Gig", gigSchema);

module.exports = Gig;
