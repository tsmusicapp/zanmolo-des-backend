const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const { toJSON, paginate } = require("./plugins");
const { roles } = require("../config/roles");

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("Invalid email");
        }
      },
    },
    password: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      validate(value) {
        if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
          throw new Error(
            "Password must contain at least one letter and one number",
          );
        }
      },
      private: true, // used by the toJSON plugin
    },
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    likedSongs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Music", // Reference to the Music model
      },
    ],
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    role: {
      type: String,
      enum: roles,
      default: "user",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    profilePicture: {
      type: String,
      default: "",
    },
    collections: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    noPassword: {
      type: Boolean,
      default: true,
    },
    squareCredentials: {
      accessToken: String,
      refreshToken: String,
      merchantId: String,
      expiresAt: String,
      tokenType: String,
      connectedAt: Date,
    },
    squareMerchantInfo: {
      id: String,
      businessName: String,
      country: String,
      languageCode: String,
      currency: String,
      status: String,
      mainLocationId: String,
      createdAt: Date,
      updatedAt: Date,
    },
    squareRawData: {
      tokenResponse: Object, // Raw token response from Square
      merchantResponse: Object, // Raw merchant response from Square
      locationsResponse: Object, // Raw locations response from Square
      lastUpdated: Date,
    },
    squareOAuthState: String,
    squareOAuthExpiry: Date,
    // Stripe integration
    stripeCustomerId: String,
    stripePaymentMethods: [
      {
        id: String,
        brand: String,
        last4: String,
        expMonth: Number,
        expYear: Number,
        isDefault: Boolean,
        createdAt: Date,
      },
    ],

    // Stripe Connect for payouts
    // Stripe Connect for payouts (Deprecated / Optional)
    stripeAccountId: String,
    stripeAccountDetails: Object,
    stripeConnectState: String,
    stripeConnectStateExpiry: Date,

    // PayPal Payouts
    paypalPayerId: String,
    paypalEmail: String, // Ensure we have the verified email
    paypalConnectedAt: Date,

    // Wallet balance (USD)
    balance: {
      type: Number,
      default: 0,
    },
    billingInfo: {
      line1: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },

    // Account cancellation fields
    accountStatus: {
      type: String,
      enum: ["active", "cancelled", "deleted"],
      default: "active",
    },
    accountCancelledAt: Date,
    accountDeletionScheduledFor: Date,
    isActive: {
      type: Boolean,
      default: true,
    },

    // Cached rating metrics for performance
    sellerMetrics: {
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
      totalOrders: {
        type: Number,
        default: 0,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    buyerMetrics: {
      averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      totalOrders: {
        type: Number,
        default: 0,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },

    // Profession metadata synced from userSpace for easy access and validation
    professionMetadata: {
      creationOccupations: [
        {
          type: String,
          trim: true,
        },
      ],
      businessOccupation: {
        type: String,
        trim: true,
        default: "",
      },
      displayProfession: {
        type: String,
        default: "",
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    timestamps: true,
  },
);

// add plugin that converts mongoose to json
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Check if password matches the user's password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

userSchema.pre("save", async function (next) {
  const user = this;
  if (user.isModified("password")) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
});

/**
 * @typedef User
 */
const User = mongoose.model("User", userSchema);

module.exports = User;
