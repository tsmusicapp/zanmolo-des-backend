const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { userService, transactionService } = require("../services");
const User = require("../models/user.model"); // Import User model
const UserSpace = require("../models/userSpace.model");
const reportService = require("../services/report.service");
const Music = require("../models/music.model");
const LyricsMusic = require("../models/lyrics.model");
const ShareMusicAsset = require("../models/shareMusicAsset.model");
const Job = require("../models/job.model"); // Uncomment if needed for job-related operations
const AppliedJobs = require("../models/appliedJobs.model"); // Uncomment if needed for job-related operations
const Chat = require("../models/chat.model"); // Tambahkan Chat model jika belum
const ChatService = require("../services/chat.service"); // Pastikan ChatService sudah ada
const { Blog } = require("../models");
const {
  exchangeAuthCode,
  paypalService,
} = require("../services/paypal.service");

const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send(user);
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["name", "role"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }
  res.send(user);
});

// GET user by id tanpa auth
const getUserByIdPublic = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "Userspaces not found");
  }
  // Ambil juga userSpace
  const userSpace = await UserSpace.findOne({ createdBy: user._id.toString() });
  // Gabungkan semua field userSpace ke object user
  let result = user.toObject();
  if (userSpace) {
    result = { ...result, ...userSpace.toObject() };
  }

  // Hitung total likes dari semua koleksi yang dibuat user ini
  const [music, lyrics, sharedAssets] = await Promise.all([
    Music.find({ createdBy: user._id }),
    LyricsMusic.find({ createdBy: user._id }),
    ShareMusicAsset.find({ createdBy: user._id }),
  ]);
  let totalLikes = 0;
  totalLikes += music.reduce(
    (sum, m) => sum + (m.likes && m.likes.length ? m.likes.length : 0),
    0,
  );
  totalLikes += lyrics.reduce(
    (sum, l) => sum + (l.likes && l.likes.length ? l.likes.length : 0),
    0,
  );
  totalLikes += sharedAssets.reduce(
    (sum, s) => sum + (s.likes && s.likes.length ? s.likes.length : 0),
    0,
  );
  result.totalLikes = totalLikes;

  // Hitung followers: user lain yang memiliki user._id di field following
  const followersCount = await User.countDocuments({ following: user._id });
  result.followers = followersCount;

  // Calculate order metrics
  const Order = require("../models/order.model");
  const Gig = require("../models/gig.model");

  // Get all gigs created by this user to calculate seller reviews
  const userGigs = await Gig.find({ seller: user._id });
  const totalReviews = userGigs.reduce(
    (sum, gig) => sum + (gig.totalReviews || 0),
    0,
  );
  result.orderQuantity = totalReviews; // Seller reviews received
  result.sellerReviews = totalReviews; // Also set as sellerReviews for clarity

  // Calculate average gig rating for seller
  const gigRatings = userGigs
    .filter((gig) => gig.averageRating && gig.averageRating > 0)
    .map((gig) => gig.averageRating);
  result.orderRating =
    gigRatings.length > 0
      ? gigRatings.reduce((sum, rating) => sum + rating, 0) / gigRatings.length
      : 0;

  // Get all orders where user is the buyer (recruiterId) - this shows buyer orders placed
  const buyerOrders = await Order.find({
    recruiterId: user._id,
    status: "complete",
  });
  result.buyerQuantity = buyerOrders.length; // Buyer orders placed

  // Calculate average buyer rating from buyer ratings
  const buyerRatings = buyerOrders
    .filter((order) => order.buyerRating && order.buyerRating > 0)
    .map((order) => order.buyerRating);
  result.buyerRating =
    buyerRatings.length > 0
      ? buyerRatings.reduce((sum, rating) => sum + rating, 0) /
        buyerRatings.length
      : 0;

  // Tambahkan isFollowing: cek apakah user login sudah mengikuti user ini
  let isFollowing = false;
  if (req.user && req.user.id) {
    const currentUser = await User.findById(req.user.id).select("following");
    if (currentUser && Array.isArray(currentUser.following)) {
      // Ubah semua id di following ke string, lalu cek apakah ada user._id di dalamnya
      const followingIds = currentUser.following.map((id) => id.toString());
      isFollowing = followingIds.includes(user._id.toString());
    }
  }
  result.isFollowing = isFollowing;

  res.send(result);
});

const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(user);
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

// Follow a user
const followUser = async (req, res) => {
  try {
    const userIdToFollow = req.params.userId; // The user being followed
    const currentUserId = req.user.id; // The currently authenticated user

    if (userIdToFollow === currentUserId) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    // Find the current user and the user to follow
    const currentUser = await userService.getUserById(currentUserId);
    const userToFollow = await userService.getUserById(userIdToFollow);

    if (!userToFollow) {
      return res.status(404).json({ message: "User to follow not found" });
    }

    // Check if the user is already following the other user
    if (currentUser.following.includes(userIdToFollow)) {
      return res
        .status(400)
        .json({ message: "You are already following this user" });
    }

    // Add the user to the following list
    currentUser.following.push(userIdToFollow);
    await currentUser.save();

    res.status(200).json({ message: "User followed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error following user" });
  }
};

// Follow a user
const unfollowUser = async (req, res) => {
  try {
    const userIdToUnfollow = req.params.userId; // The user being followed
    const currentUserId = req.user.id; // The currently authenticated user

    if (userIdToUnfollow === currentUserId) {
      return res.status(400).json({ message: "You cannot unfollow yourself" });
    }

    // Find the current user and the user to follow
    const currentUser = await userService.getUserById(currentUserId);
    const userToFollow = await userService.getUserById(userIdToUnfollow);

    if (!userToFollow) {
      return res.status(404).json({ message: "User to follow not found" });
    }

    // Check if the user is NOT following the other user
    if (!currentUser.following.includes(userIdToUnfollow)) {
      return res
        .status(400)
        .json({ message: "You are not following this user" });
    }

    // Remove the user from the following list
    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== userIdToUnfollow.toString(),
    );

    await currentUser.save();

    return res.status(200).json({ message: "User unfollowed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error following user" });
  }
};

const getMyFollowing = async (req, res) => {
  try {
    const currentUserId = req.user.id; // Get the current user id from the auth middleware

    // Find the current user by ID to get the following list (which is an array of user IDs)
    const currentUser = await userService.getUserById(currentUserId);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the following user IDs (an array of ObjectIds)
    const followingUserIds = currentUser.following;

    if (!followingUserIds || followingUserIds.length === 0) {
      return res.status(200).json({ following: [] }); // No users to follow
    }

    // Fetch the details of users being followed by the current user
    const followingUsers = await User.find({
      _id: { $in: followingUserIds },
    }).select("name email"); // Select only name and email fields

    // Return the populated data
    res.status(200).json({ following: followingUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching following list" });
  }
};

// Get current user's saved billing information
const getMyBilling = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select("billingInfo");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res
    .status(200)
    .json({ success: true, billingInfo: user.billingInfo || null });
});

// Get current user info
const getMe = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res.status(200).json(user);
});

// Get current user's wallet balance
const getMyBalance = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select("balance");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res.status(200).json({
    success: true,
    balance: typeof user.balance === "number" ? user.balance : 0,
  });
});

// Get current user's transaction history
const getMyTransactions = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const filter = pick(req.query, ["type", "status"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  const result = await transactionService.getUserTransactions(
    userId,
    filter,
    options,
  );
  res.status(200).json({ success: true, ...result });
});

// Process withdrawal request
const requestWithdrawal = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { amount } = req.body;

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Valid withdrawal amount is required" });
  }

  const result = await transactionService.processWithdrawal(userId, amount);

  res.status(200).json({
    success: true,
    message: "Withdrawal request submitted successfully",
    transaction: result.transaction,
    newBalance: result.newBalance,
  });
});

// Get transaction statistics for current user
const getMyTransactionStats = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const stats = await transactionService.getTransactionStats(userId);
  res.status(200).json({ success: true, ...stats });
});

// Check PayPal connection status
const getPaypalConnection = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select(
    "paypalPayerId paypalEmail paypalConnectedAt",
  );

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const isConnected = !!(user.paypalPayerId && user.paypalEmail);

  res.status(200).json({
    success: true,
    connected: isConnected,
    isConnected,
    paypalEmail: user.paypalEmail || null,
    paypalPayerId: user.paypalPayerId || null,
    connectedAt: user.paypalConnectedAt,
  });
});

// Get PayPal Connect URL (Frontend should handle this, but if we need a server-generated state/url)
const getPaypalConnectUrl = catchAsync(async (req, res) => {
  try {
    const userId = req.user.id;
    const clientId = process.env.PAYPAL_CLIENT_ID;

    // Generate state for security if needed (optional for simple flow)
    const state = require("crypto").randomBytes(32).toString("hex");

    // Construct PayPal OAuth URL
    // Scopes: openid email https://uri.paypal.com/services/payouts (if needed, but mostly for login we need email)
    // Actually for Payouts we just need their Payer ID (via login) or Email.
    // Standard "Log in with PayPal" scopes: openid email
    const scope = "openid email";
    const redirectUri = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/callback/paypal`; // Redirect to callback page

    const connectUrl =
      `${
        process.env.NODE_ENV === "production"
          ? "https://www.paypal.com"
          : "https://www.sandbox.paypal.com"
      }/connect?` +
      `flowEntry=static&` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;

    console.log(connectUrl);

    res.status(200).json({
      success: true,
      url: connectUrl,
    });
  } catch (error) {
    console.error("Error generating PayPal Connect URL:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate PayPal Connect URL",
    });
  }
});

// Connect PayPal (Exchange code)
const connectPaypal = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { code } = req.body;

  if (!code) {
    return res
      .status(400)
      .json({ success: false, message: "Authorization code is required" });
  }

  try {
    // Exchange code for token
    const tokenData = await paypalService.exchangeAuthCode(code);

    // Get user info
    const userInfo = await paypalService.getUserInfo(tokenData.access_token);

    // Extract email (handle standard field or array)
    // PayPal sometimes returns 'emails' array or just 'email'
    let userEmail = userInfo.email;
    if (!userEmail && userInfo.emails && userInfo.emails.length > 0) {
      userEmail = userInfo.emails[0].value;
    }

    // Extract Payer ID - user_id is often the OpenID URL. payer_id is the alphanumeric ID.
    // If payer_id is missing, we might only have user_id (URL).
    const payerId = userInfo.payer_id || userInfo.user_id;

    if (!userEmail) {
      throw new Error(
        "Could not retrieve email from PayPal account. Please ensure you have a verified email.",
      );
    }

    // Update user
    await User.findByIdAndUpdate(userId, {
      paypalPayerId: payerId,
      paypalEmail: userEmail,
      paypalConnectedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "PayPal account connected successfully",
      email: userEmail,
    });
  } catch (error) {
    console.error("PayPal Connection Error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to connect PayPal account",
    });
  }
});

// Disconnect PayPal account
const disconnectPaypal = catchAsync(async (req, res) => {
  const userId = req.user.id;

  await User.findByIdAndUpdate(userId, {
    $unset: {
      paypalPayerId: 1,
      paypalEmail: 1,
      paypalConnectedAt: 1,
    },
  });

  res.status(200).json({
    success: true,
    message: "PayPal account disconnected successfully",
  });
});

// Process withdrawal to user's PayPal account
const processWithdrawal = catchAsync(async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    console.log(`Processing withdrawal for user ${userId}, amount: ${amount}`);

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid withdrawal amount",
      });
    }

    // Minimum withdrawal: $1.00
    if (amount < 1.0) {
      return res.status(400).json({
        success: false,
        error: "Minimum withdrawal amount is $1.00",
      });
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if user has enough balance
    if (user.balance < amount) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance",
      });
    }

    // Check if user has connected PayPal account
    if (!user.paypalEmail) {
      return res.status(400).json({
        success: false,
        error: "Please connect your PayPal account first",
      });
    }

    // Process PayPal Payout
    // Note: In Payouts, sender usually pays fees. We can deduct a fee if we want.
    // Let's assume we deduct a small processing fee or pass it on?
    // Current Stripe logic: 2.9% + 0.30. PayPal is usually cheaper for payouts ($0.25 flat for US).
    // Let's keep it simple: No fee to user for now OR keep similar fee structure to not break expectations?
    // User requested "completely migrate", so I will use a simple fee structure or none if not specified.
    // The previous code had a fee. I'll maintain a similar fee concept but maybe adjusted for PayPal or kept generic.
    // Let's assume a generic 2% fee for safety/platform or keeps Stripe's to be safe?
    // Actually, Payouts API fees are charged to the merchant account, not deducted from the payout amount unless we calculate it that way.
    // I will deduct a flat $0.25 + 2% as a "Platform Fee" to cover costs.
    const platformFee = amount * 0.02 + 0.25;
    const netAmount = amount - platformFee;

    if (netAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Withdrawal amount too small after fees.",
      });
    }

    const payout = await paypalService.createPayout({
      receiverEmail: user.paypalEmail,
      amount: netAmount,
      currency: "USD",
      note: `Withdrawal from Music App`,
      senderItemId: `WD-${userId}-${Date.now()}`,
    });

    // Deduct full amount from user balance
    const newBalance = user.balance - amount;

    await User.findByIdAndUpdate(userId, {
      balance: newBalance,
      $push: {
        transactions: {
          type: "withdrawal",
          amount: -amount,
          balance: newBalance,
          description: `Withdrawal to PayPal (${user.paypalEmail})`,
          paypalPayoutBatchId: payout.batch_header?.payout_batch_id,
          platformFee: platformFee,
          netAmount: netAmount,
          createdAt: new Date(),
        },
      },
    });

    console.log(`Withdrawal successful for user ${userId}:`, {
      batchId: payout.batch_header?.payout_batch_id,
      amount: amount,
      netAmount,
    });

    res.status(200).json({
      success: true,
      message: "Withdrawal processed successfully",
      data: {
        batchId: payout.batch_header?.payout_batch_id,
        originalAmount: amount,
        fee: platformFee,
        netAmount: netAmount,
        newBalance,
        estimatedArrival: "Immediate to 24 hours",
      },
    });
  } catch (error) {
    console.error("Withdrawal processing error:", error);
    res.status(500).json({
      success: false,
      error: "Withdrawal processing failed. Please try again later.",
    });
  }
});

// Cancel user account with 10-day grace period
const cancelAccount = catchAsync(async (req, res) => {
  try {
    const userId = req.user.id;
    const { password, confirmationText } = req.body;

    // Validate input
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    if (confirmationText !== "DELETE MY ACCOUNT") {
      return res.status(400).json({
        success: false,
        message: "Invalid confirmation text",
      });
    }

    // Get user and verify password
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify password
    const isPasswordValid = await user.isPasswordMatch(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    // Check if account is already cancelled
    if (user.accountStatus === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Account is already cancelled",
      });
    }

    // Check for active orders that need to be completed or cancelled
    const Order = require("../models/order.model");
    const activeOrders = await Order.find({
      $or: [
        {
          recruiterId: userId,
          status: {
            $in: [
              "pending",
              "in_progress",
              "revision_requested",
              "accepted",
              "delivered",
            ],
          },
        },
        {
          sellerId: userId,
          status: {
            $in: [
              "pending",
              "in_progress",
              "revision_requested",
              "accepted",
              "delivered",
            ],
          },
        },
      ],
    });

    if (activeOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "You have active orders (pending, in progress, accepted, or delivered) that must be completed or cancelled before account deletion",
        activeOrders: activeOrders.length,
        orders: activeOrders.map((order) => ({
          id: order._id,
          title: order.title,
          status: order.status,
          role: order.recruiterId.toString() === userId ? "buyer" : "seller",
        })),
      });
    }

    // Check if user has balance > $1 that needs to be withdrawn
    const userBalance = user.balance || 0;
    if (userBalance > 1) {
      return res.status(400).json({
        success: false,
        message: `You have a balance of $${userBalance.toFixed(
          2,
        )} that must be withdrawn before account deletion`,
        balance: userBalance,
        withdrawalRequired: true,
      });
    }

    // Set account status to cancelled and schedule deletion
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 10); // 10 days from now

    await User.findByIdAndUpdate(userId, {
      accountStatus: "cancelled",
      accountCancelledAt: new Date(),
      accountDeletionScheduledFor: deletionDate,
      isActive: false, // Immediately deactivate account
    });

    res.status(200).json({
      success: true,
      message: "Account cancellation initiated successfully",
      data: {
        cancellationDate: new Date(),
        deletionDate: deletionDate,
        gracePeriodDays: 10,
      },
    });
  } catch (error) {
    console.error("Account cancellation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel account. Please try again later.",
    });
  }
});

// Admin-only: Get all users with extra info
const getAllUsersAdmin = async (req, res) => {
  try {
    // Hanya admin yang boleh akses
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: Admin only." });
    }
    const users = await User.find({});
    // Ambil userSpace untuk setiap user
    const userSpaces = await UserSpace.find({
      createdBy: { $in: users.map((u) => u._id.toString()) },
    });
    const result = users.map((u) => {
      const userSpace = userSpaces.find(
        (us) => us.createdBy === u._id.toString(),
      );
      // Cek apakah user ini diblokir oleh user lain (blockedUsers)
      const isBlockedByOthers = users.some(
        (other) =>
          other._id.toString() !== u._id.toString() &&
          Array.isArray(other.blockedUsers) &&
          other.blockedUsers
            .map((id) => id.toString())
            .includes(u._id.toString()),
      );
      return {
        id: u._id,
        username: userSpace
          ? userSpace.firstName + " " + userSpace.lastName
          : u.name,
        email: u.email,
        country:
          (userSpace && userSpace.address ? userSpace.address : "").split(
            ",",
          )[0] || "-",
        followers: u.following ? u.following.length : 0,
        likes: u.likedSongs ? u.likedSongs.length : 0,
        orders: 0, // dummy
        sales: 0, // dummy
        lastLogin: u.lastLogin || "2025-06-01T00:00:00Z", // dummy
        isBlock: isBlockedByOthers, // Cek apakah user ini diblokir oleh user lain
      };
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin-only: Delete one or many users
const deleteUsersAdmin = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: Admin only." });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No user IDs provided." });
    }
    // Delete users by IDs
    const result = await User.deleteMany({ _id: { $in: ids } });
    res.status(200).json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin-only: Send message to one or many users (dummy implementation)
const sendMessageAdmin = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: Admin only." });
    }
    const { ids, message } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !message) {
      return res.status(400).json({
        success: false,
        message: "User IDs and message are required.",
      });
    }
    const adminId = req.user._id || req.user.id;
    for (const userId of ids) {
      await ChatService.saveMessage(adminId, userId, message, {
        type: "adminMessage",
        from: "admin",
        date: new Date(),
      });
    }
    res.status(200).json({
      success: true,
      message: `Message sent to ${ids.length} user(s).`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin-only: Block a user
const blockUserAdmin = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: Admin only." });
    }
    const { id, ids } = req.body;
    let blockIds = [];
    if (Array.isArray(ids) && ids.length > 0) {
      blockIds = ids;
    } else if (id) {
      blockIds = [id];
    } else {
      return res
        .status(400)
        .json({ success: false, message: "User ID(s) required." });
    }
    // Tambahkan blockIds ke blockedUsers semua user (jika belum ada)
    const users = await User.find({});
    let updatedCount = 0;
    for (const user of users) {
      let changed = false;
      for (const blockId of blockIds) {
        if (
          user._id.toString() !== blockId &&
          !user.blockedUsers.includes(blockId)
        ) {
          user.blockedUsers.push(blockId);
          changed = true;
        }
      }
      if (changed) {
        await user.save();
        updatedCount++;
      }
    }
    res.status(200).json({
      success: true,
      message: `Blocked for all users. Updated ${updatedCount} user(s).`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin-only: Unblock a user
const unblockUserAdmin = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: Admin only." });
    }
    const { id, ids } = req.body;
    let unblockIds = [];
    if (Array.isArray(ids) && ids.length > 0) {
      unblockIds = ids;
    } else if (id) {
      unblockIds = [id];
    } else {
      return res
        .status(400)
        .json({ success: false, message: "User ID(s) required." });
    }
    // Hilangkan unblockIds dari blockedUsers semua user
    const users = await User.find({});
    let updatedCount = 0;
    for (const user of users) {
      const before = user.blockedUsers.length;
      user.blockedUsers = user.blockedUsers.filter(
        (blockedId) => !unblockIds.includes(blockedId.toString()),
      );
      if (user.blockedUsers.length !== before) {
        await user.save();
        updatedCount++;
      }
    }
    res.status(200).json({
      success: true,
      message: `Unblocked for all users. Updated ${updatedCount} user(s).`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin-only: Get all reports
const getAllReportsAdmin = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: Admin only." });
    }
    // Get all reports with userId and reportedUserId populated
    const reports = await reportService.getAllReports();
    // Get all userSpace for all userId and reportedUserId in reports
    const userIds = [
      ...new Set([
        ...reports.map((r) =>
          r.userId && r.userId._id
            ? r.userId._id.toString()
            : r.userId
            ? r.userId.toString()
            : null,
        ),
        ...reports.map((r) =>
          r.reportedUserId && r.reportedUserId._id
            ? r.reportedUserId._id.toString()
            : r.reportedUserId
            ? r.reportedUserId.toString()
            : null,
        ),
      ]),
    ].filter(Boolean);
    const userSpaces = await UserSpace.find({ createdBy: { $in: userIds } });
    // Helper to get userSpace by userId
    const getUserSpace = (id) =>
      userSpaces.find((us) => us.createdBy === (id ? id.toString() : null));
    // Fetch reported data for each report based on type and reportedId
    const reportsWithUserSpace = await Promise.all(
      reports.map(async (r) => {
        const userId =
          r.userId && r.userId._id
            ? r.userId._id.toString()
            : r.userId
            ? r.userId.toString()
            : null;
        const reportedUserId =
          r.reportedUserId && r.reportedUserId._id
            ? r.reportedUserId._id.toString()
            : r.reportedUserId
            ? r.reportedUserId.toString()
            : null;
        const userSpace1 = getUserSpace(userId);
        const userSpace2 = getUserSpace(reportedUserId);
        // Build new userId object
        let userIdObj = {
          ...(r.userId && r.userId.toObject ? r.userId.toObject() : r.userId),
        };
        if (userSpace1) {
          userIdObj.name = userSpace1.firstName + " " + userSpace1.lastName;
        }
        // Build new reportedUserId object
        let reportedUserIdObj = {
          ...(r.reportedUserId && r.reportedUserId.toObject
            ? r.reportedUserId.toObject()
            : r.reportedUserId),
        };
        if (userSpace2) {
          reportedUserIdObj.name =
            userSpace2.firstName + " " + userSpace2.lastName;
        }
        // Fetch reported data and normalize to only name/title
        let reportedData = null;
        if (r.type === "music") {
          const music = await Music.findById(r.reportedId);
          reportedData = music ? music.songName : null;
        } else if (r.type === "lyric") {
          const lyric = await LyricsMusic.findById(r.reportedId);
          reportedData = lyric ? lyric.lyricName : null;
        } else if (r.type === "job") {
          const job = await Job.findById(r.reportedId);
          reportedData = job ? job.title : null;
        } else if (r.type === "user") {
          const userSpace = await UserSpace.findOne({
            createdBy: r.reportedId,
          });
          reportedData = userSpace
            ? userSpace.firstName + " " + userSpace.lastName
            : null;
        }
        return {
          ...r.toObject(),
          userId: userIdObj,
          reportedUserId: reportedUserIdObj,
          reportedData,
        };
      }),
    );
    res.status(200).json({ success: true, data: reportsWithUserSpace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin-only: Delete one or many reports
const deleteReportsAdmin = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: Admin only." });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No report IDs provided." });
    }
    // Ambil semua report yang akan dihapus
    const reports = await reportService.getReportsByIds(ids);
    let deletedContent = 0;
    for (const report of reports) {
      if (report.type === "music") {
        await Music.findByIdAndDelete(report.reportedId);
        deletedContent++;
      } else if (report.type === "lyrics") {
        await LyricsMusic.findByIdAndDelete(report.reportedId);
        deletedContent++;
      } else if (report.type === "assets") {
        await ShareMusicAsset.findByIdAndDelete(report.reportedId);
        deletedContent++;
      } else if (report.type === "user") {
        await User.findByIdAndDelete(report.reportedId);
        // Hapus semua music, lyric, asset, dan job milik user ini
        await Music.deleteMany({ createdBy: report.reportedId });
        await LyricsMusic.deleteMany({ createdBy: report.reportedId });
        await ShareMusicAsset.deleteMany({ createdBy: report.reportedId });
        await Job.deleteMany({ createdBy: report.reportedId });
        deletedContent++;
      } else if (report.type === "job") {
        await Job.findByIdAndDelete(report.reportedId);
        await AppliedJobs.findOneAndDelete({ jobId: report.reportedId });
        deletedContent++;
      } else if (report.type === "blog") {
        await Blog.findByIdAndDelete(report.reportedId);
        deletedContent++;
      }
      // Tambahkan tipe lain jika perlu
    }
    // Hapus reportnya
    const result = await reportService.deleteReports(ids);
    res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      deletedContent,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createUser,
  getUsers,
  getUser,
  getUserByIdPublic,
  updateUser,
  deleteUser,
  followUser,
  getMyFollowing,
  getAllUsersAdmin,
  deleteUsersAdmin,
  sendMessageAdmin,
  blockUserAdmin,
  unblockUserAdmin,
  getAllReportsAdmin,
  deleteReportsAdmin,
  getMyBilling,
  getMe,
  getMyBalance,
  getMyTransactions,
  requestWithdrawal,
  getMyTransactionStats,
  processWithdrawal,
  cancelAccount,
  getPaypalConnection,
  getPaypalConnectUrl,
  exchangeAuthCode,
  disconnectPaypal,
  connectPaypal,
  unfollowUser,
};
