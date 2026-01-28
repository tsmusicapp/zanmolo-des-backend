const Order = require("../models/order.model");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const { Mongoose } = require("mongoose");
const { UserSpace, Gig } = require("../models");
const transactionService = require("./transaction.service");
const RatingService = require("./rating.service");

const createOrder = async (orderData) => {
  console.log(orderData, "data to save here");

  // Set totalAmount sama dengan price jika belum ada
  if (!orderData.totalAmount) {
    orderData.totalAmount = orderData.price;
  }

  // Handle gigId field - if gigId is provided, also set it to gig field for consistency
  if (orderData.gigId) {
    orderData.gig = orderData.gigId;
  }

  // Initialize activities with creation event
  const creator = orderData.createdBy || null;
  orderData.activities = [
    {
      action: "created",
      by: creator,
      note: "Order created",
      toStatus: orderData.status || "inprogress",
    },
  ];

  const order = await Order.create(orderData);
  if (!order)
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error while posting the order request",
    );
  return order;
};

const getOrderById = async (orderId, currentUser) => {
  const order = await Order.findById(orderId)
    .populate({
      path: "createdBy",
      select: "name email address phone profilePicture bio role",
    })
    .populate({
      path: "recruiterId",
      select: "name email address phone profilePicture bio role",
    })
    .populate({
      path: "gig",
      select: "title description category packages seller",
    })
    .populate({
      path: "gigId",
      select: "title description category packages seller",
    });

  console.log(order, "order found by id");
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  // Determine which user data to include based on current user's role
  let otherUser = null;

  // Determine myRole based on the order context, not just user's system role
  const createdById =
    order.createdBy && order.createdBy._id
      ? order.createdBy._id.toString()
      : null;
  const recruiterId =
    order.recruiterId && order.recruiterId._id
      ? order.recruiterId._id.toString()
      : null;
  const currentUserId = currentUser._id
    ? currentUser._id.toString()
    : currentUser.id
    ? currentUser.id.toString()
    : null;
  const amCreator = createdById === currentUserId;
  const amRecruiter = recruiterId === currentUserId;

  // createdBy = seller (user), recruiterId = buyer (recruiter) in this system
  let myRole = amRecruiter
    ? "recruiter"
    : amCreator
    ? "user"
    : currentUser.role;

  // Fetch UserSpace for both sides (if available)
  const createdByIdStr = order.createdBy
    ? order.createdBy._id.toString()
    : null;
  const recruiterIdStr = order.recruiterId
    ? order.recruiterId._id.toString()
    : null;
  const [createdBySpace, recruiterSpace] = await Promise.all([
    createdByIdStr
      ? UserSpace.findOne({ createdBy: createdByIdStr }).lean()
      : null,
    recruiterIdStr
      ? UserSpace.findOne({ createdBy: recruiterIdStr }).lean()
      : null,
  ]);

  if (currentUser.role === "recruiter") {
    // If current user is recruiter, show the user who created the order
    otherUser = order.createdBy
      ? {
          id: order.createdBy._id,
          firstName:
            createdBySpace && createdBySpace.firstName
              ? createdBySpace.firstName
              : "",
          lastName:
            createdBySpace && createdBySpace.lastName
              ? createdBySpace.lastName
              : "",
          email: order.createdBy.email,
          address: order.createdBy.address,
          phone: order.createdBy.phone,
          profilePicture: order.createdBy.profilePicture,
          bio: order.createdBy.bio,
          role: order.createdBy.role,
          userSpace: createdBySpace || null,
        }
      : null;
  } else if (currentUser.role === "user") {
    // If current user is user, show the recruiter assigned to the order
    otherUser = order.recruiterId
      ? {
          id: order.recruiterId._id,
          firstName:
            recruiterSpace && recruiterSpace.firstName
              ? recruiterSpace.firstName
              : "",
          lastName:
            recruiterSpace && recruiterSpace.lastName
              ? recruiterSpace.lastName
              : "",
          email: order.recruiterId.email,
          address: order.recruiterId.address,
          phone: order.recruiterId.phone,
          profilePicture: order.recruiterId.profilePicture,
          bio: order.recruiterId.bio,
          role: order.recruiterId.role,
          userSpace: recruiterSpace || null,
        }
      : null;
  }

  // Return order with additional user data
  const orderData = order.toObject();
  // Ensure activities is present in response
  // Attach activities and enrich each activity's "by" field with firstName and lastName from UserSpace
  orderData.activities = await Promise.all(
    (order.activities || []).map(async (activity) => {
      if (activity.by) {
        const userSpace = await UserSpace.findOne({
          createdBy: activity.by.toString(),
        }).lean();
        return {
          action: activity.action,
          by: activity.by,
          firstName:
            userSpace && userSpace.firstName ? userSpace.firstName : "",
          lastName: userSpace && userSpace.lastName ? userSpace.lastName : "",
          note: activity.note,
          toStatus: activity.toStatus,
          fromStatus: activity.fromStatus,
          at: activity.at,
          meta: activity.meta,
        };
      }
      return {
        action: activity.action,
        by: activity.by,
        note: activity.note,
        toStatus: activity.toStatus,
        fromStatus: activity.fromStatus,
        at: activity.at,
        meta: activity.meta,
      };
    }),
  );
  orderData.otherUser = otherUser;
  orderData.createdBy = createdBySpace;
  orderData.myRole = myRole;

  return orderData;
};

const updateOrderStatus = async (
  orderId,
  status,
  message,
  actorId = null,
  actionType = "status_changed",
) => {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  // Update status and message based on the status type
  const prevStatus = order.status;
  order.status = status;
  if (status === "revision") {
    order.revison_message = message;
  } else if (status === "cancel") {
    order.cancel_message = message;
  } else if (status === "complete") {
    order.completedAt = new Date();
    // Calculate total amount including tip
    order.totalAmount = order.price + (order.tip || 0);
  }

  // Log activity
  order.activities = order.activities || [];
  order.activities.push({
    action: actionType || "status_changed",
    by: actorId,
    note: message,
    fromStatus: prevStatus,
    toStatus: status,
  });

  await order.save();

  // Update gig stats when order is completed
  if (status === "complete" && order.gig) {
    try {
      const gig = await Gig.findById(order.gig);
      if (gig) {
        // Increment total orders
        gig.totalOrders = (gig.totalOrders || 0) + 1;

        // Add to total earnings
        gig.totalEarnings =
          (gig.totalEarnings || 0) + (order.totalAmount || order.price || 0);

        await gig.save();
        console.log(
          `✅ Updated gig stats via updateOrderStatus: totalOrders=${gig.totalOrders}, totalEarnings=${gig.totalEarnings}`,
        );
      }
    } catch (error) {
      console.error("❌ Error updating gig stats in updateOrderStatus:", error);
    }
  }

  // Update user metrics (Buyer & Seller) when order is completed
  if (status === "complete") {
    try {
      // Update Seller Metrics
      if (order.createdBy) {
        await RatingService.updateUserMetrics(order.createdBy);
      }
      // Update Buyer Metrics
      if (order.recruiterId) {
        await RatingService.updateUserMetrics(order.recruiterId);
      }
    } catch (error) {
      console.error(
        "❌ Error updating user metrics in updateOrderStatus:",
        error,
      );
    }
  }

  return order;
};

const addReviewAndRating = async (
  orderId,
  { rating, review, tip, actorId = null, buyerRating, buyerReview },
) => {
  // Find the order by ID
  const order = await Order.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  // Determine roles
  const buyerId = order.recruiterId || order.buyer;
  const isBuyer =
    buyerId && actorId && buyerId.toString() === actorId.toString();

  // ONLY Buyer can leave rating for Seller
  if (!isBuyer) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the buyer can leave a review for this order",
    );
  }

  // Map incoming data to buyer fields (Rating FOR the Seller)
  order.buyerRating = buyerRating || rating;
  order.buyerReview = buyerReview || review;
  order.buyerReviewAt = new Date();

  // For backward compatibility with legacy fields if needed
  order.rating = order.buyerRating;
  order.review = order.buyerReview;

  // Update tip and total amount
  order.tip = tip || 0;
  order.totalAmount = order.price + (tip || 0);

  // Log activity for review
  order.activities = order.activities || [];
  order.activities.push({
    action: "review_set",
    by: actorId,
    note: buyerReview || review,
    meta: {
      rating: rating || buyerRating,
      tip: tip || 0,
      buyerRating,
      buyerReview,
    },
  });

  // Save the updated order
  await order.save();

  // Update gig stats when order is completed
  if (order.status === "complete" && order.gig) {
    try {
      const gig = await Gig.findById(order.gig);
      if (gig) {
        // Increment total orders
        gig.totalOrders = (gig.totalOrders || 0) + 1;

        // Add to total earnings
        gig.totalEarnings =
          (gig.totalEarnings || 0) + (order.totalAmount || order.price || 0);

        await gig.save();
        console.log(
          `✅ Updated gig stats: totalOrders=${gig.totalOrders}, totalEarnings=${gig.totalEarnings}`,
        );
      }
    } catch (error) {
      console.error("❌ Error updating gig stats:", error);
    }
  }

  // If this is a gig order and we have buyer rating, add review to gig
  console.log("=== REVIEW SUBMISSION DEBUG ===");
  console.log("Order type:", order.type);
  console.log("Order gig:", order.gig);
  console.log("Buyer rating:", buyerRating);
  console.log("Buyer review:", buyerReview);

  // Check if this is a gig order OR if it has gig information
  const isGigOrder =
    order.type === "gig_order" || order.type === "music_order" || order.gig;

  if (isGigOrder && order.gig && buyerRating && buyerReview && buyerId) {
    try {
      console.log("Adding review to gig using RatingService...");

      // Use the new RatingService to add review and update all metrics
      await RatingService.addReviewToGig(order.gig, {
        buyerId: buyerId,
        rating: buyerRating,
        comment: buyerReview,
        orderId: order._id,
      });

      console.log("Review added successfully via RatingService");
    } catch (error) {
      console.error("Error adding review via RatingService:", error);
      // Don't throw error here, just log it
    }
  } else {
    console.log("Conditions not met for adding gig review:");
    console.log("- Is gig order or has gig:", isGigOrder);
    console.log("- Has gig ID:", !!order.gig);
    console.log("- Has buyer rating:", !!buyerRating);
    console.log("- Has buyer review:", !!buyerReview);
    console.log("- Has buyer ID:", !!buyerId);
  }

  // Update metrics for both buyer and seller
  // Seller metrics update
  if (order.createdBy) {
    await RatingService.updateUserMetrics(order.createdBy);
  }
  // Buyer metrics update
  if (buyerId) {
    await RatingService.updateUserMetrics(buyerId);
  }

  return order;
};

const submitReviewReply = async (orderId, reply, actorId) => {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  // Verify actor is the seller (createdBy)
  if (order.createdBy.toString() !== actorId.toString()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the seller can reply to reviews",
    );
  }

  // Verify there is a buyer review to reply to
  if (!order.buyerRating) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No buyer review found to reply to",
    );
  }

  // Verify reply doesn't already exist
  if (order.buyerReviewReply) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Reply already submitted");
  }

  order.sellerReply = reply;
  order.sellerRepliedAt = new Date();

  // Log activity
  order.activities = order.activities || [];
  order.activities.push({
    action: "review_reply",
    by: actorId,
    note: "Seller replied to review",
    meta: { reply },
  });

  await order.save();
  return order;
};

const getMyOrders = async (user) => {
  // Always fetch orders where the current user is involved on either side
  const meId = (user._id || user.id).toString();
  const orders = await Order.find({
    $or: [{ createdBy: meId }, { recruiterId: meId }],
    status: { $in: ["accepted", "delivered", "complete", "cancel"] }, // Only show these 4 statuses
  })
    .populate({
      path: "createdBy",
      select: "name email address phone profilePicture bio role",
    })
    .populate({
      path: "recruiterId",
      select: "name email address phone profilePicture bio role",
    })
    .populate({
      path: "gig",
      select: "title description category packages seller",
    })
    .populate({
      path: "gigId",
      select: "title description category packages seller",
    });

  // Collect the "other" party ids to batch fetch UserSpaces
  const targetUserIds = new Set();
  for (const o of orders) {
    const createdById =
      o.createdBy && o.createdBy._id ? o.createdBy._id.toString() : null;
    const recruiterId =
      o.recruiterId && o.recruiterId._id ? o.recruiterId._id.toString() : null;
    if (createdById === meId && recruiterId) targetUserIds.add(recruiterId);
    else if (recruiterId === meId && createdById)
      targetUserIds.add(createdById);
  }
  const spaces = await UserSpace.find({
    createdBy: { $in: Array.from(targetUserIds) },
  }).lean();
  const spaceMap = new Map(spaces.map((s) => [s.createdBy.toString(), s]));

  // Shape response: include otherUser, myRole per order, and a flag if otherUser is the current session
  const formattedOrders = orders.map((order) => {
    const orderData = order.toObject();
    const createdById =
      order.createdBy && order.createdBy._id
        ? order.createdBy._id.toString()
        : null;
    const recruiterId =
      order.recruiterId && order.recruiterId._id
        ? order.recruiterId._id.toString()
        : null;
    const amCreator = createdById === meId;
    const amRecruiter = recruiterId === meId;

    // Determine other participant and my role for this order
    let otherUser = null;
    let myRole = amCreator ? "user" : amRecruiter ? "recruiter" : user.role;

    if (amCreator && order.recruiterId) {
      const s = spaceMap.get(recruiterId);
      otherUser = {
        id: order.recruiterId._id,
        firstName: s && s.firstName ? s.firstName : "",
        lastName: s && s.lastName ? s.lastName : "",
        profilePicture: s && s.profilePicture ? s.profilePicture : null,
      };
    } else if (amRecruiter && order.createdBy) {
      const s = spaceMap.get(createdById);
      otherUser = {
        id: order.createdBy._id,
        firstName: s && s.firstName ? s.firstName : "",
        lastName: s && s.lastName ? s.lastName : "",
        profilePicture: s && s.profilePicture ? s.profilePicture : null,
      };
    }

    orderData.otherUser = otherUser;
    orderData.otherUserIsCurrentUser =
      otherUser && otherUser.id && otherUser.id.toString
        ? otherUser.id.toString() === meId
        : false; // true only in degenerate cases
    orderData.myRole = myRole;
    return orderData;
  });

  return formattedOrders;
};

const getCompletedOrders = async (user) => {
  // Fetch orders with status "complete" and created by the current user
  const orders = await Order.find({
    createdBy: user._id || user.id,
    status: "complete",
  })
    .select("title price tip startTime recruiterId")
    .populate({ path: "recruiterId", select: "name" });

  // Batch fetch recruiter userSpaces
  const recruiterIds = orders
    .map((o) => (o.recruiterId && o.recruiterId._id ? o.recruiterId._id : null))
    .filter(Boolean)
    .map((id) => id.toString());
  const spaces = await UserSpace.find({
    createdBy: { $in: recruiterIds },
  }).lean();
  const spaceMap = new Map(spaces.map((s) => [s.createdBy.toString(), s]));

  // Map through the orders to include tip and recruiter name
  const formattedOrders = orders.map((order) => {
    const s = order.recruiterId
      ? spaceMap.get(order.recruiterId._id.toString())
      : null;
    const buyerName =
      s && s.firstName && s.lastName
        ? `${s.firstName} ${s.lastName}`
        : order.recruiterId && order.recruiterId.name
        ? order.recruiterId.name
        : "Unknown";
    return {
      title: order.title,
      price: order.price,
      startTime: order.startTime,
      by: user.name || "Unknown",
      tip: order.tip || null,
      buyer: buyerName,
    };
  });

  return formattedOrders;
};

/**
 * Get reviews for a user (where they are the seller)
 * @param {string} userId - The seller's user ID
 * @returns {Promise<Order[]>}
 */
const getUserSellerReviews = async (userId) => {
  return Order.find({
    createdBy: userId,
    status: "complete",
    $or: [
      { buyerRating: { $exists: true, $gt: 0 } },
      { buyerReview: { $exists: true, $ne: "" } },
    ],
  })
    .populate("recruiterId", "name profilePicture")
    .select(
      "buyerRating buyerReview buyerReviewAt sellerReply sellerRepliedAt createdAt recruiterId title",
    )
    .sort({ createdAt: -1 });
};

module.exports = {
  createOrder,
  getOrderById,
  updateOrderStatus,
  addReviewAndRating,
  submitReviewReply,
  getMyOrders,
  getCompletedOrders,
  getUserSellerReviews, // Export the new function
  async extendDelivery(orderId, extraDays, actorId) {
    if (!Number.isFinite(extraDays) || extraDays <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "extraDays must be a positive number",
      );
    }
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }
    const prev = order.delivery_time || 0;
    order.delivery_time = prev + extraDays;
    order.activities = order.activities || [];
    order.activities.push({
      action: "extend_delivery",
      by: actorId,
      note: `Extend delivery by ${extraDays} day(s)`,
      meta: {
        addedDays: extraDays,
        previous: prev,
        newTotal: order.delivery_time,
      },
    });
    await order.save();
    return order;
  },
  async requestExtension(orderId, days, reason, actorId) {
    if (!Number.isFinite(days) || days <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "days must be a positive number",
      );
    }
    const order = await Order.findById(orderId);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    order.extensions = order.extensions || [];
    const ext = {
      days,
      reason,
      requestedBy: actorId,
      status: "pending",
      requestedAt: new Date(),
    };
    order.extensions.push(ext);
    const extId =
      order.extensions[order.extensions.length - 1] &&
      order.extensions[order.extensions.length - 1]._id
        ? order.extensions[order.extensions.length - 1]._id
        : ext._id; // subdoc _id assigned by mongoose
    order.activities = order.activities || [];
    order.activities.push({
      action: "extend_requested",
      by: actorId,
      note: reason || `Request extend by ${days} day(s)`,
      meta: { days, extensionId: extId ? extId.toString() : undefined },
    });
    await order.save();
    return order;
  },
  async decideExtension(orderId, extensionIndex, decision, deciderId) {
    const order = await Order.findById(orderId);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    if (
      !Array.isArray(order.extensions) ||
      extensionIndex < 0 ||
      extensionIndex >= order.extensions.length
    ) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid extension index");
    }
    const ext = order.extensions[extensionIndex];
    if (ext.status !== "pending") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Extension already decided");
    }
    if (!["accepted", "declined"].includes(decision)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid decision");
    }
    ext.status = decision;
    ext.decidedBy = deciderId;
    ext.decidedAt = new Date();

    if (decision === "accepted") {
      const prev = order.delivery_time || 0;
      order.delivery_time = prev + (ext.days || 0);
      order.activities = order.activities || [];
      order.activities.push({
        action: "extend_accepted",
        by: deciderId,
        note: `Extend accepted (+${ext.days} day(s))`,
        meta: {
          addedDays: ext.days,
          previous: prev,
          newTotal: order.delivery_time,
          extensionIndex,
        },
      });
    } else {
      order.activities = order.activities || [];
      order.activities.push({
        action: "extend_declined",
        by: deciderId,
        note: `Extend delivery by ${ext.days} day(s) declined`,
        meta: { extensionIndex, days: ext.days },
      });
    }

    // Remove corresponding 'extend_requested' activity entry
    const extIdStr = ext._id ? ext._id.toString() : null;
    let removed = false;
    if (extIdStr) {
      const before = order.activities.length;
      order.activities = order.activities.filter((a) => {
        if (a.action !== "extend_requested") return true;
        const aExtId =
          a.meta && a.meta.extensionId ? String(a.meta.extensionId) : null;
        return aExtId !== extIdStr;
      });
      removed = order.activities.length !== before;
    }
    if (!removed) {
      // Fallback: remove the most recent 'extend_requested'
      for (let i = order.activities.length - 1; i >= 0; i--) {
        if (order.activities[i].action === "extend_requested") {
          order.activities.splice(i, 1);
          break;
        }
      }
    }

    await order.save();
    return order;
  },
  async decideExtensionById(orderId, extensionId, decision, deciderId) {
    const order = await Order.findById(orderId);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    if (!Array.isArray(order.extensions) || order.extensions.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "No extensions to decide");
    }
    const idx = order.extensions.findIndex(
      (e) => e._id && e._id.toString() === String(extensionId),
    );
    if (idx === -1)
      throw new ApiError(httpStatus.BAD_REQUEST, "Extension not found");
    // Reuse logic
    return this.decideExtension(orderId, idx, decision, deciderId);
  },
  async decideLatestPending(orderId, decision, deciderId) {
    const order = await Order.findById(orderId);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    if (!Array.isArray(order.extensions) || order.extensions.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "No extensions to decide");
    }
    let idx = -1;
    for (let i = order.extensions.length - 1; i >= 0; i--) {
      if (order.extensions[i].status === "pending") {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No pending extension to decide",
      );
    }
    return this.decideExtension(orderId, idx, decision, deciderId);
  },
  async requestCancellation(orderId, reason, actorId, attachments = []) {
    const order = await Order.findById(orderId);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    order.cancellations = order.cancellations || [];
    const req = {
      reason,
      requestedBy: actorId,
      status: "pending",
      requestedAt: new Date(),
      attachments: attachments || [],
    };
    order.cancellations.push(req);
    const cancelId =
      order.cancellations[order.cancellations.length - 1] &&
      order.cancellations[order.cancellations.length - 1]._id
        ? order.cancellations[order.cancellations.length - 1]._id
        : req._id;
    order.activities = order.activities || [];
    order.activities.push({
      action: "cancel_requested",
      by: actorId,
      note: reason || "Request cancellation",
      meta: { cancellationId: cancelId ? cancelId.toString() : undefined },
    });
    await order.save();
    return order;
  },
  async decideLatestCancel(orderId, decision, deciderId) {
    const order = await Order.findById(orderId)
      .populate("createdBy", "name")
      .populate("recruiterId", "name");
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    if (
      !Array.isArray(order.cancellations) ||
      order.cancellations.length === 0
    ) {
      throw new ApiError(httpStatus.BAD_REQUEST, "No cancellations to decide");
    }
    let idx = -1;
    for (let i = order.cancellations.length - 1; i >= 0; i--) {
      if (order.cancellations[i].status === "pending") {
        idx = i;
        break;
      }
    }
    if (idx === -1)
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No pending cancellation to decide",
      );
    const req = order.cancellations[idx];
    if (!["accepted", "declined"].includes(decision)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid decision");
    }
    req.status = decision;
    req.decidedBy = deciderId;
    req.decidedAt = new Date();

    // Get user info for better messaging
    const deciderName =
      deciderId.toString() === order.createdBy._id.toString()
        ? order.createdBy.name
        : order.recruiterId.name;

    order.activities = order.activities || [];
    if (decision === "accepted") {
      const prevStatus = order.status;
      order.status = "cancel";
      order.cancel_message = req.reason || order.cancel_message;
      order.activities.push({
        action: "cancel_accepted",
        by: deciderId,
        note: `Cancellation accepted by ${deciderName}`,
        fromStatus: prevStatus,
        toStatus: "cancel",
      });
      // Ensure refund is processed when cancellation is accepted
      await this.processCancellationRefund(order, deciderId);
    } else {
      // When declined, set status for admin review
      req.status = "admin_review";
      req.declinedBy = deciderId;
      req.declinedByName = deciderName;

      order.activities.push({
        action: "cancel_declined",
        by: deciderId,
        note: `Cancellation declined by ${deciderName}. Now under admin review for final decision.`,
        meta: {
          declinedByName: deciderName,
          requiresAdminReview: true,
        },
      });

      // Chat notifications removed - not requested
    }

    // Remove corresponding 'cancel_requested'
    const cancelIdStr = req._id ? req._id.toString() : null;
    let removed = false;
    if (cancelIdStr) {
      const before = order.activities.length;
      order.activities = order.activities.filter((a) => {
        if (a.action !== "cancel_requested") return true;
        const aId =
          a.meta && a.meta.cancellationId
            ? String(a.meta.cancellationId)
            : null;
        return aId !== cancelIdStr;
      });
      removed = order.activities.length !== before;
    }
    if (!removed) {
      for (let i = order.activities.length - 1; i >= 0; i--) {
        if (order.activities[i].action === "cancel_requested") {
          order.activities.splice(i, 1);
          break;
        }
      }
    }

    await order.save();
    return order;
  },

  // Check if order can be cancelled (prevent cancellation after delivery)
  async canCancelOrder(orderId, userId) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Check if user is participant
    const isCreator =
      order.createdBy && order.createdBy.toString() === userId.toString();
    const isRecruiter =
      order.recruiterId && order.recruiterId.toString() === userId.toString();

    if (!isCreator && !isRecruiter) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Not authorized to cancel this order",
      );
    }

    // Prevent cancellation after successful delivery
    if (order.status === "delivered" || order.status === "complete") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Cannot cancel order after successful delivery. Please contact support for assistance.",
      );
    }

    // Check if there's already a pending cancellation
    const pendingCancellation =
      order.cancellations &&
      order.cancellations.find((c) => c.status === "pending");
    if (pendingCancellation) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "There is already a pending cancellation request for this order",
      );
    }

    return true;
  },

  // Process refund when order is cancelled
  async processCancellationRefund(order, actorId) {
    try {
      const { User } = require("../models");

      // Check if refund is still eligible
      if (!order.refundEligible) {
        console.log("Refund not eligible for this order");
        order.activities.push({
          action: "refund_denied",
          by: actorId,
          note: "Refund not eligible - order has been delivered successfully",
          meta: { reason: "delivery_completed" },
        });
        return;
      }

      // Check if refund was already processed
      if (order.refundProcessed) {
        console.log("Refund already processed for this order");
        order.activities.push({
          action: "refund_already_processed",
          by: actorId,
          note: "Refund was already processed for this order",
          meta: {
            refundAmount: order.refundAmount,
            processedAt: order.refundProcessedAt,
          },
        });
        return;
      }

      // Get buyer ID (recruiterId is the buyer)
      const buyerId = order.recruiterId || order.buyer;
      console.log(`🔍 ORDER DETAILS:`, {
        orderId: order._id,
        createdBy: order.createdBy,
        recruiterId: order.recruiterId,
        buyer: order.buyer,
        determinedBuyerId: buyerId,
      });

      if (!buyerId) {
        console.log("❌ No buyer found for refund");
        return;
      }

      // Check if order was paid
      if (!order.payment || order.paymentStatus !== "paid") {
        console.log(
          "⚠️ Order was not paid, but processing refund anyway for testing",
        );
        console.log("📊 Order details:", {
          hasPayment: !!order.payment,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          price: order.price,
          totalAmount: order.totalAmount,
        });
        // Continue with refund even if no payment record (for testing)
      }

      // Calculate refund amount (full amount paid by buyer)
      const refundAmount = parseFloat(
        order.payment && order.payment.amount
          ? order.payment.amount
          : order.price || order.totalAmount,
      );
      console.log(`💰 CALCULATED REFUND AMOUNT: $${refundAmount}`);

      // Add refund to buyer's balance
      const buyerBefore = await User.findById(buyerId);
      console.log(
        `💰 BUYER BALANCE BEFORE REFUND: $${buyerBefore.balance || 0}`,
      );

      await User.findByIdAndUpdate(buyerId, {
        $inc: { balance: refundAmount },
      });

      const buyerAfter = await User.findById(buyerId);
      console.log(`💰 BUYER BALANCE AFTER REFUND: $${buyerAfter.balance || 0}`);
      console.log(`✅ REFUND AMOUNT ADDED: $${refundAmount}`);

      // Create transaction record for refund
      await transactionService.createTransaction({
        userId: buyerId,
        type: "refund",
        amount: refundAmount,
        currency: "USD",
        status: "completed",
        description: `Refund for cancelled order: ${order.title}`,
        relatedOrderId: order._id,
        netAmount: refundAmount,
        processedAt: new Date(),
        metadata: {
          orderId: order._id.toString(),
          orderTitle: order.title,
          refundReason: "order_cancellation",
          cancelledBy: actorId.toString(),
        },
      });

      // Update order refund tracking
      order.refundProcessed = true;
      order.refundAmount = refundAmount;
      order.refundProcessedAt = new Date();

      console.log(
        `✅ REFUND PROCESSED: Added $${refundAmount.toFixed(
          2,
        )} to buyer balance for cancelled order ${order._id}`,
      );

      // Log refund activity
      order.activities.push({
        action: "refund_processed",
        by: actorId,
        note: `Refund of $${refundAmount.toFixed(
          2,
        )} processed to buyer balance`,
        meta: {
          refundAmount: refundAmount,
          buyerId: buyerId.toString(),
        },
      });
    } catch (error) {
      console.error("Error processing cancellation refund:", error);
      // Log error but don't fail the cancellation
      order.activities.push({
        action: "refund_failed",
        by: actorId,
        note: `Refund processing failed: ${error.message}`,
        meta: { error: error.message },
      });
    }
  },

  // Direct cancellation (immediate cancellation without approval)
  async directCancelOrder(orderId, reason, actorId) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Check if cancellation is allowed
    await this.canCancelOrder(orderId, actorId);

    const prevStatus = order.status;
    order.status = "cancel";
    order.cancel_message = reason || "Order cancelled";

    // Log cancellation activity
    order.activities = order.activities || [];
    order.activities.push({
      action: "order_cancelled",
      by: actorId,
      note: reason || "Order cancelled",
      fromStatus: prevStatus,
      toStatus: "cancel",
    });

    // Process refund if order was paid
    console.log(`🔄 PROCESSING REFUND FOR ORDER: ${orderId}`);
    console.log(`📊 ORDER PAYMENT INFO:`, {
      hasPayment: !!order.payment,
      paymentStatus: order.paymentStatus,
      paymentAmount:
        order.payment && order.payment.amount ? order.payment.amount : null,
      orderPrice: order.price,
    });

    await this.processCancellationRefund(order, actorId);

    await order.save();
    return order;
  },
};
