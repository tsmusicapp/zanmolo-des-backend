const httpStatus = require("http-status");
const pick = require("../utils/pick");
const regexFilter = require("../utils/regexFilter");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { orderService } = require("../services");
const { Order } = require("../models");
const ChatService = require("../services/chat.service");
const { uploadFileToS3 } = require("../utils/s3Upload");
const stripeService = require("../services/stripe.service");
const {
  calculateBuyerPayment,
  calculateSellerPayout,
} = require("../utils/feeCalculator");
const { paypalService } = require("../services/paypal.service");

// const httpStatus = require('http-status');
// const ApiError = require('../utils/ApiError');

const createOrder = async (req, res) => {
  try {
    // Handle both direct order data and nested order data from Redux
    const orderData = req.body.order || req.body;
    orderData.createdBy = req.user._id; // Attach the user ID from the authenticated request

    // If order status is inprogress, create chat with cardData directly
    let chatId = null;
    if (orderData.status === "inprogress") {
      const createdBy = orderData.createdBy; // Get the already set createdBy
      let recruiterId = orderData.recruiterId;

      console.log("Request data:", {
        createdBy: createdBy.toString(),
        recruiterId: recruiterId,
        chat_id: orderData.chat_id,
      });

      // If recruiterId is not provided but chat_id exists, get from chat participants
      if (!recruiterId && orderData.chat_id) {
        console.log("Looking for recruiterId from chat_id:", orderData.chat_id);
        try {
          const existingChat = await ChatService.getChatById(orderData.chat_id);
          if (existingChat) {
            console.log("Chat participants:", existingChat.participants);
            console.log("CreatedBy:", createdBy.toString());
            // Get participant who is not the createdBy
            recruiterId = existingChat.participants.find(
              (p) => p.toString() !== createdBy.toString(),
            );
            console.log("Found recruiterId:", recruiterId);
          } else {
            console.log("Chat not found with ID:", orderData.chat_id);
          }
        } catch (chatError) {
          console.error("Error fetching chat:", chatError);
        }
      }

      recruiterId = orderData.chat_id || recruiterId; // Use chat_id if available, otherwise use recruiterId

      // Validate recruiterId must exist
      if (!recruiterId) {
        console.log("recruiterId not found!");
        return res.status(httpStatus.BAD_REQUEST).send({
          message: "Recruiter ID is required for order creation",
        });
      }

      // Set recruiterId to orderData
      orderData.recruiterId = recruiterId;

      // Create order first to get ID
      const tempOrder = await orderService.createOrder(orderData);

      // Prepare cardData after order is created
      const cardData = {
        type: "order_request",
        orderId: tempOrder._id.toString(),
        title: tempOrder.title,
        description: tempOrder.description,
        price: tempOrder.price,
        delivery_time: tempOrder.delivery_time,
        status: tempOrder.status,
        createdBy: tempOrder.createdBy.toString(),
        recruiterId: tempOrder.recruiterId.toString(),
        createdAt: tempOrder.createdAt,
      };

      // Create message with cardData - for Order Request
      const message = `📝 Order Request: ${tempOrder.title}`;

      try {
        // Create chat with cardData directly
        const chat = await ChatService.saveMessage(
          createdBy,
          recruiterId,
          message,
          cardData,
        );
        chatId = chat._id;

        // Update order with chat_id and log activity
        tempOrder.chat_id = chatId;
        tempOrder.activities = tempOrder.activities || [];
        await tempOrder.save();

        console.log(
          "Chat created successfully with cardData for order:",
          tempOrder._id,
        );
        res.status(httpStatus.CREATED).send(tempOrder);
        return;
      } catch (chatError) {
        console.error("Error creating chat for order:", chatError);
        return res.status(httpStatus.BAD_REQUEST).send({
          message: "Failed to create chat for order: " + chatError.message,
        });
      }
    } else {
      // For status other than inprogress, create regular order
      const order = await orderService.createOrder(orderData);
      res.status(httpStatus.CREATED).send(order);
    }
  } catch (error) {
    res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

const getOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const currentUser = req.user; // Get current user from auth middleware
    const order = await orderService.getOrderById(orderId, currentUser);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }
    res.status(httpStatus.OK).send(order);
  } catch (error) {
    res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { status, message } = req.body;
    let updatedOrder;

    if (message != (undefined || null)) {
      updatedOrder = await orderService.updateOrderStatus(
        orderId,
        status,
        message,
        req.user._id,
        "status_changed",
      );
    } else {
      updatedOrder = await orderService.updateOrderStatus(
        orderId,
        status,
        " ",
        req.user._id,
        "status_changed",
      );
    }

    res.status(httpStatus.OK).send(updatedOrder);
  } catch (error) {
    res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Accept Order - Specifically for accepting order requests
const acceptOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.user._id;

    // Update order status to accepted
    const updatedOrder = await orderService.updateOrderStatus(
      orderId,
      "accepted",
      "Order accepted",
      userId,
      "accepted",
    );

    // Send "Order Accepted" card message to chat
    const cardData = {
      type: "order_accepted",
      orderId: updatedOrder._id.toString(),
      title: updatedOrder.title,
      description: updatedOrder.description,
      price: updatedOrder.price,
      delivery_time: updatedOrder.delivery_time,
      status: "accepted",
      acceptedBy: userId.toString(),
      acceptedAt: new Date(),
    };

    const message = `✅ Order Accepted: ${updatedOrder.title}`;

    // Send to chat
    await ChatService.saveMessage(
      userId,
      updatedOrder.createdBy,
      message,
      cardData,
    );

    // Delete previous order request messages with this orderId to reduce clutter
    await ChatService.deleteOrderRequestMessagesByOrderId(orderId);

    res.status(httpStatus.OK).send(updatedOrder);
  } catch (error) {
    res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Decline Order - Specifically for declining order requests
const declineOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.user._id;
    const { reason } = req.body;

    // Update order status to cancel
    const updatedOrder = await orderService.updateOrderStatus(
      orderId,
      "cancel",
      reason || "Order declined",
      userId,
      "declined",
    );

    // Send "Order Declined" card message to chat
    const cardData = {
      type: "order_declined",
      orderId: updatedOrder._id.toString(),
      title: updatedOrder.title,
      description: updatedOrder.description,
      price: updatedOrder.price,
      delivery_time: updatedOrder.delivery_time,
      reason: reason || "Order declined",
      declinedBy: userId.toString(),
      declinedAt: new Date(),
    };

    const message = `❌ Order Declined: ${updatedOrder.title}`;

    // Send to chat
    await ChatService.saveMessage(
      userId,
      updatedOrder.createdBy,
      message,
      cardData,
    );

    // Delete previous order request messages with this orderId to reduce clutter
    await ChatService.deleteOrderRequestMessagesByOrderId(orderId);

    res.status(httpStatus.OK).send(updatedOrder);
  } catch (error) {
    res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Process Order Payment - Handle payment before accepting order
const processOrderPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.user._id || req.user.id;
    const {
      amount,
      currency = "USD",
      paymentMethod,
      billingAddress,
      savePaymentInfo,
      stripePaymentMethodId,
    } = req.body;

    console.log("Processing order payment:", {
      orderId,
      userId,
      amount,
      paymentMethod,
      stripePaymentMethodId,
    });

    // Validate userId exists
    if (!userId) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "User ID not found in request",
      );
    }

    // Get order details first
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Get user details for Stripe customer
    const { User } = require("../models");
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Calculate fees using new fee structure
    const {
      calculateBuyerPayment,
      calculateSellerPayout,
    } = require("../utils/feeCalculator");
    const orderAmount = parseFloat(order.price);
    const buyerPayment = calculateBuyerPayment(orderAmount);
    const sellerPayout = calculateSellerPayout(orderAmount);

    // Validate payment amount matches calculated total (including fees)
    if (parseFloat(amount) !== buyerPayment.totalAmount) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Payment amount does not match calculated total. Expected: $${buyerPayment.totalAmount}, Received: $${amount}`,
      );
    }

    let paymentResult = null;

    if (paymentMethod === "stripe") {
      console.log("Processing Stripe payment for order:", orderId);

      // Create or get Stripe customer
      let stripeCustomer;
      if (user.stripeCustomerId) {
        stripeCustomer = await stripeService.getStripeCustomer(userId);
      } else {
        stripeCustomer = await stripeService.createStripeCustomer({
          email: user.email,
          name: user.name,
          userId: userId,
        });

        // Save Stripe customer ID to user
        await User.findByIdAndUpdate(userId, {
          $set: { stripeCustomerId: stripeCustomer.id },
        });
      }

      // Create payment intent with actual Stripe integration
      const paymentData = {
        amount: parseFloat(amount),
        currency: currency.toLowerCase(),
        customerId: stripeCustomer.id,
        paymentMethodId: stripePaymentMethodId, // This should be the actual payment method from frontend
        metadata: {
          orderId: orderId.toString(),
          userId: userId.toString(),
          orderTitle: order.title,
        },
        description: `Order payment for: ${order.title}`,
        savePaymentMethod: savePaymentInfo || false,
      };

      console.log("Creating Stripe payment intent with data:", paymentData);

      const paymentIntent = await stripeService.createPaymentIntent(
        paymentData,
      );

      console.log("Stripe payment intent created:", {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
      });

      // Check if payment was successful
      if (paymentIntent.status === "succeeded") {
        paymentResult = {
          success: true,
          paymentId: paymentIntent.id,
          amount: amount,
          currency: currency,
          status: "succeeded",
        };
      } else if (paymentIntent.status === "requires_action") {
        // Return payment intent for frontend to handle 3D Secure or other actions
        return res.status(httpStatus.OK).send({
          success: false,
          requiresAction: true,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          message: "Payment requires additional authentication",
        });
      } else {
        throw new ApiError(
          httpStatus.PAYMENT_REQUIRED,
          `Payment failed with status: ${paymentIntent.status}`,
        );
      }
    } else {
      // For non-Stripe payment methods, use simulation (can be extended for other payment providers)
      paymentResult = {
        success: true,
        paymentId: `test_payment_${Date.now()}`,
        amount: amount,
        currency: currency,
        status: "succeeded",
      };
    }

    if (!paymentResult || !paymentResult.success) {
      throw new ApiError(
        httpStatus.PAYMENT_REQUIRED,
        "Payment processing failed",
      );
    }

    // Create payment record with fee breakdown
    const paymentRecord = {
      orderId: orderId,
      userId: userId,
      amount: amount, // Total amount paid by buyer
      originalAmount: orderAmount, // Original order amount
      currency: currency,
      paymentMethod: paymentMethod,
      paymentId: paymentResult.paymentId,
      status: "completed",
      billingAddress: billingAddress,
      processedAt: new Date(),
      // Fee breakdown
      fees: {
        buyer: buyerPayment,
        seller: sellerPayout,
        platformFee: buyerPayment.platformFee + buyerPayment.flatFee,
        squareProcessingFee: sellerPayout.squareProcessingFee,
        netAmountToSeller: sellerPayout.netAmount,
      },
    };

    // Add payment info to order
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        payment: paymentRecord,
        paymentStatus: "paid",
      },
    });

    // Save billing info if requested
    if (savePaymentInfo && billingAddress) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          billingInfo: billingAddress,
          "billingInfo.updatedAt": new Date(),
        },
      });
      console.log("Billing info saved for user:", userId);
    }

    console.log("Order payment processed successfully:", {
      orderId,
      paymentId: paymentResult.paymentId,
      amount,
    });

    res.status(httpStatus.OK).send({
      success: true,
      message: "Payment processed successfully",
      paymentId: paymentResult.paymentId,
      orderId: orderId,
      amount: amount,
      currency: currency,
    });
  } catch (error) {
    console.error("Order payment error:", error);
    res.status(error.statusCode || httpStatus.BAD_REQUEST).send({
      success: false,
      message: error.message,
    });
  }
};

const addReviewAndRating = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const {
      rating,
      review,
      tip,
      buyerRating,
      sellerRating,
      buyerReview,
      sellerReview,
    } = req.body;

    // Validate legacy single rating system
    if (
      (rating && typeof rating !== "number") ||
      (rating && (rating < 1 || rating > 5))
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Rating must be a number between 1 and 5",
      );
    }

    // Validate new dual rating system
    if (
      buyerRating &&
      (typeof buyerRating !== "number" || buyerRating < 1 || buyerRating > 5)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Buyer rating must be a number between 1 and 5",
      );
    }

    if (
      sellerRating &&
      (typeof sellerRating !== "number" || sellerRating < 1 || sellerRating > 5)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Seller rating must be a number between 1 and 5",
      );
    }

    // Validate review lengths for dual system
    if (buyerReview && (buyerReview.length < 10 || buyerReview.length > 200)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Buyer review must be between 10 and 200 characters",
      );
    }

    if (
      sellerReview &&
      (sellerReview.length < 10 || sellerReview.length > 200)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Seller review must be between 10 and 200 characters",
      );
    }

    // Call the service to add review and rating
    const updatedOrder = await orderService.addReviewAndRating(orderId, {
      rating,
      review,
      tip,
      actorId: req.user._id,
      buyerRating,
      sellerRating,
      buyerReview,
      sellerReview,
    });

    res.status(httpStatus.OK).send(updatedOrder);
  } catch (error) {
    res
      .status(error.statusCode || httpStatus.BAD_REQUEST)
      .send({ message: error.message });
  }
};

// Create PayPal Order (Checkout)
const createPaypalOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id || req.user.id;

    // Get order
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Calculate total amount (Buyer pays: Order + Fees + VAT)
    const orderAmount = parseFloat(order.price);
    const { calculateBuyerPayment } = require("../utils/feeCalculator");
    const buyerPayment = calculateBuyerPayment(orderAmount);

    // Create PayPal Order
    const paypalOrder = await paypalService.createOrder({
      amount: buyerPayment.totalAmount,
      currency: "USD",
    });

    res.status(httpStatus.OK).send({
      success: true,
      orderId: paypalOrder.id, // PayPal Order ID
      approvalUrl: paypalOrder.links.find((link) => link.rel === "approve")
        ?.href,
    });
  } catch (error) {
    console.error("Create PayPal Order Error:", error);
    res
      .status(error.statusCode || httpStatus.BAD_REQUEST)
      .send({ message: error.message });
  }
};

// Capture PayPal Order
const capturePaypalOrder = async (req, res) => {
  try {
    const { orderId } = req.params; // Backend Order ID
    const { paypalOrderId } = req.body; // PayPal Order ID from frontend
    const userId = req.user._id || req.user.id; // Backend User ID

    if (!paypalOrderId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "PayPal Order ID is required");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Capture Payment
    const captureData = await paypalService.captureOrder(paypalOrderId);

    if (captureData.status !== "COMPLETED") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "PayPal capture not completed",
      );
    }

    // Get Fees
    const orderAmount = parseFloat(order.price);
    const {
      calculateBuyerPayment,
      calculateSellerPayout,
    } = require("../utils/feeCalculator");
    const buyerPayment = calculateBuyerPayment(orderAmount);
    const sellerPayout = calculateSellerPayout(orderAmount);

    const purchaseUnit = captureData.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];

    // Create Payment Record
    const paymentRecord = {
      orderId: orderId,
      userId: userId,
      amount: parseFloat(capture?.amount?.value || buyerPayment.totalAmount),
      originalAmount: orderAmount,
      currency: "USD",
      paymentMethod: "paypal",
      paymentId: capture?.id || paypalOrderId, // Use capture ID preferably
      status: "completed",
      processedAt: new Date(),
      fees: {
        buyer: buyerPayment,
        seller: sellerPayout,
        platformFee: buyerPayment.platformFee + buyerPayment.flatFee,
        paypalFee: parseFloat(
          capture?.seller_receivable_breakdown?.paypal_fee?.value || "0",
        ),
        netAmountToSeller: sellerPayout.netAmount, // TODO: Adjust if PayPal fee structure differs effectively
      },
    };

    // Update Order
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        payment: paymentRecord,
        paymentStatus: "paid",
      },
    });

    // Automatically accept order (as per existing logic)
    // Note: For cleanliness, we could just call the service or replicate acceptance logic.
    // We'll mimic the acceptance logic from processOrderPayment:
    // No explicit "accept" API call here, client usually does it or flow implies it.
    // But the previous code had a specific fetch call to /accept.
    // We should just update status if needed or let client handle the redirect.
    // The previous processOrderPayment frontend logic did an explicit fetch to /accept.
    // We can do it here server-side to be robust.

    // Update status to accepted if it was pending/inprogress
    // Actually, existing logic: frontend calls /accept. Let's stick to updating payment only here.
    // Wait, processOrderPayment logic had: "Automatically accept the order after successful payment"
    // Let's do it here.
    if (order.status !== "accepted" && order.status !== "complete") {
      await orderService.updateOrderStatus(
        orderId,
        "accepted",
        "Order auto-accepted after payment",
        userId,
        "accepted",
      );
    }

    res.status(httpStatus.OK).send({
      success: true,
      message: "Payment captured successfully",
      orderId: orderId,
    });
  } catch (error) {
    console.error("Capture PayPal Order Error:", error);
    res
      .status(error.statusCode || httpStatus.BAD_REQUEST)
      .send({ message: error.message });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const user = req.user;
    // console.log(user, 'user')
    const orders = await orderService.getMyOrders(user);
    res.status(httpStatus.OK).send(orders);
  } catch (error) {
    res
      .status(error.statusCode || httpStatus.BAD_REQUEST)
      .send({ message: error.message });
  }
};

const getCompletedOrders = async (req, res) => {
  try {
    const user = req.user;

    const orders = await orderService.getCompletedOrders(user);
    res.status(httpStatus.OK).send(orders);
  } catch (error) {
    res
      .status(error.statusCode || httpStatus.BAD_REQUEST)
      .send({ message: error.message });
  }
};

// Record a message on an order (activities only; no chat message)
const sendOrderMessage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .send({ message: "Message is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    }

    // Only participants can send messages
    const createdByStr = order.createdBy ? order.createdBy.toString() : null;
    const recruiterStr = order.recruiterId
      ? order.recruiterId.toString()
      : null;
    const userIdStr = userId.toString();
    if (userIdStr !== createdByStr && userIdStr !== recruiterStr) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to message on this order" });
    }

    // Log message only in activities
    order.activities = order.activities || [];
    const activity = {
      action: "message",
      by: userId,
      note: message.trim(),
    };
    order.activities.push(activity);

    await order.save();

    return res
      .status(httpStatus.CREATED)
      .send({ success: true, orderId: order._id });
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Request to extend delivery (approval flow)
const requestExtension = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { days, reason } = req.body;
    const userId = req.user._id;
    // Only participants can request
    const order = await Order.findById(orderId).select("createdBy recruiterId");
    if (!order)
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    const uid = userId.toString();
    if (
      uid !== order.createdBy.toString() &&
      uid !== order.recruiterId.toString()
    ) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to request extension" });
    }
    const updated = await orderService.requestExtension(
      orderId,
      Number(days),
      reason,
      userId,
    );
    return res.status(httpStatus.OK).send(updated);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Accept or decline a pending extension
const decideExtension = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { decision } = req.body; // decision: 'accepted' | 'declined'
    const userId = req.user._id;
    // Only participants can decide
    const order = await Order.findById(orderId).select(
      "createdBy recruiterId extensions",
    );
    if (!order)
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    const uid = userId.toString();
    if (
      uid !== order.createdBy.toString() &&
      uid !== order.recruiterId.toString()
    ) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to decide extension" });
    }
    const updated = await orderService.decideLatestPending(
      orderId,
      decision,
      userId,
    );
    return res.status(httpStatus.OK).send(updated);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};
// Extend delivery time (request only, pending approval) and log activity
const extendDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { extraDays, days, reason } = req.body;
    const userId = req.user._id;
    const reqDays = Number(days || extraDays);
    if (!Number.isFinite(reqDays) || reqDays <= 0) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .send({ message: "extraDays must be a positive number" });
    }
    // Only participants can extend
    const order = await Order.findById(orderId).select("createdBy recruiterId");
    if (!order)
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    const uid = userId.toString();
    if (
      uid !== order.createdBy.toString() &&
      uid !== order.recruiterId.toString()
    ) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to extend this order" });
    }
    // Create a pending extension request instead of immediately extending
    const updated = await orderService.requestExtension(
      orderId,
      reqDays,
      reason,
      userId,
    );
    return res.status(httpStatus.OK).send(updated);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Request order cancellation
const requestCancellation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, attachments } = req.body;
    const userId = req.user._id;
    const order = await Order.findById(orderId).select("createdBy recruiterId");
    if (!order)
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    const uid = userId.toString();
    if (
      uid !== order.createdBy.toString() &&
      uid !== order.recruiterId.toString()
    ) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to request cancellation" });
    }

    // Handle file uploads to S3
    let cancellationAttachments = [];

    // If attachments are provided as JSON (from frontend after upload)
    if (attachments && Array.isArray(attachments)) {
      cancellationAttachments = attachments;
    }

    // If files are uploaded directly (multipart/form-data)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const s3Result = await uploadFileToS3(file, uid);
          cancellationAttachments.push({
            filename: s3Result.key,
            originalName: file.originalname,
            url: s3Result.url,
            size: file.size,
            mimetype: file.mimetype,
            uploadedAt: new Date(),
          });
        } catch (uploadError) {
          console.error(
            "Error uploading cancellation attachment to S3:",
            uploadError,
          );
          return res.status(httpStatus.BAD_REQUEST).send({
            message: `Failed to upload file ${file.originalname}: ${uploadError.message}`,
          });
        }
      }
    }

    const updated = await orderService.requestCancellation(
      orderId,
      reason,
      userId,
      cancellationAttachments,
    );
    return res.status(httpStatus.OK).send(updated);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Decide latest pending cancellation (accept/decline)
const decideCancellation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { decision } = req.body; // 'accepted' | 'declined'
    const userId = req.user._id;
    const order = await Order.findById(orderId).select("createdBy recruiterId");
    if (!order)
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    const uid = userId.toString();
    if (
      uid !== order.createdBy.toString() &&
      uid !== order.recruiterId.toString()
    ) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to decide cancellation" });
    }
    const updated = await orderService.decideLatestCancel(
      orderId,
      decision,
      userId,
    );
    return res.status(httpStatus.OK).send(updated);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Direct cancellation (immediate cancellation without approval)
const directCancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    const updated = await orderService.directCancelOrder(
      orderId,
      reason,
      userId,
    );
    return res.status(httpStatus.OK).send(updated);
  } catch (error) {
    return res.status(error.statusCode || httpStatus.BAD_REQUEST).send({
      message: error.message,
    });
  }
};

// Check if order can be cancelled
const checkCancellationEligibility = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    await orderService.canCancelOrder(orderId, userId);

    return res.status(httpStatus.OK).send({
      success: true,
      message: "Order can be cancelled",
    });
  } catch (error) {
    return res.status(error.statusCode || httpStatus.BAD_REQUEST).send({
      success: false,
      message: error.message,
    });
  }
};

// Submit a delivery for approval (sets status to 'delivered')
const submitDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    const order = await Order.findById(orderId);
    if (!order)
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    const uid = userId.toString();
    const createdByStr = order.createdBy ? order.createdBy.toString() : null;
    const recruiterStr = order.recruiterId
      ? order.recruiterId.toString()
      : null;
    if (uid !== createdByStr && uid !== recruiterStr) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to submit delivery for this order" });
    }

    // Handle file uploads to S3
    const deliveryFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const s3Result = await uploadFileToS3(file, uid);
          deliveryFiles.push({
            filename: file.originalname,
            url: s3Result.url,
            key: s3Result.key,
            uploadedAt: new Date(),
            downloadCount: 0,
          });
        } catch (uploadError) {
          console.error("Error uploading file to S3:", uploadError);
          return res.status(httpStatus.BAD_REQUEST).send({
            message: `Failed to upload file ${file.originalname}: ${uploadError.message}`,
          });
        }
      }
    }

    // Add uploaded files to order
    if (deliveryFiles.length > 0) {
      order.deliveryFiles = order.deliveryFiles || [];
      order.deliveryFiles.push(...deliveryFiles);
    }

    const note = message || "Delivery submitted";

    // Add activity with file links
    order.activities = order.activities || [];
    order.activities.push({
      action: "delivery_submitted",
      by: userId,
      note: note,
      fromStatus: order.status,
      toStatus: "delivered",
      meta: {
        filesUploaded: deliveryFiles.map((f) => ({
          filename: f.filename,
          url: f.url,
        })),
      },
    });

    // Update status
    order.status = "delivered";
    await order.save();

    // Per requirement, do not push activity to chat messages for delivery submissions

    return res.status(httpStatus.OK).send(order);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Accept a submitted delivery (sets status to 'complete')
const acceptDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;
    const order = await Order.findById(orderId);
    if (!order)
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    const uid = userId.toString();
    const createdByStr = order.createdBy ? order.createdBy.toString() : null;
    const recruiterStr = order.recruiterId
      ? order.recruiterId.toString()
      : null;
    if (uid !== createdByStr && uid !== recruiterStr) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to accept this delivery" });
    }

    // Update seller balance when buyer accepts delivery
    const { User } = require("../models");
    const orderAmount = parseFloat(order.price);

    // Find seller by ID (the one who created the order)
    const sellerId = order.createdBy;
    const seller = await User.findById(sellerId);

    if (seller) {
      // Calculate seller payout: Order amount - 10% platform fee - 1.32% VAT (Stripe fees now charged on withdrawal)
      const platformFee = orderAmount * 0.1; // 10% platform fee
      const vatAmount = orderAmount * 0.0132; // 1.32% VAT
      const sellerPayout = orderAmount - platformFee - vatAmount;

      await User.findByIdAndUpdate(sellerId, {
        $inc: { balance: sellerPayout },
      });

      console.log(
        `✅ DELIVERY ACCEPTED: Added $${sellerPayout.toFixed(2)} to seller ${
          seller.email
        } (Order: $${orderAmount}, Platform Fee: $${platformFee.toFixed(
          2,
        )}, VAT: $${vatAmount.toFixed(2)})`,
      );
    }

    // Mark refund as ineligible after successful delivery
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        refundEligible: false,
        completedAt: new Date(),
      },
    });

    const note = message || "Delivery accepted";
    const updatedOrder = await orderService.updateOrderStatus(
      orderId,
      "complete",
      note,
      userId,
      "delivery_accepted",
    );

    // Per requirement, do not push activity to chat messages for delivery accepted
    return res.status(httpStatus.OK).send(updatedOrder);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Admin: list orders with rejected cancellation requests (now admin_review status)
const getRejectedCancellationOrders = async (req, res) => {
  try {
    // Find orders having any cancellation with status 'admin_review'
    const orders = await Order.find({
      cancellations: { $elemMatch: { status: "admin_review" } },
    })
      .select("title status createdAt cancellations recruiterId createdBy")
      .populate("recruiterId", "name email")
      .populate("createdBy", "name email");

    // Shape response with admin review cancellation info
    const data = orders.map((o) => {
      const adminReview = (o.cancellations || []).filter(
        (c) => c.status === "admin_review",
      );
      const latest = adminReview.sort(
        (a, b) =>
          new Date(b.decidedAt || b.requestedAt) -
          new Date(a.decidedAt || a.requestedAt),
      )[0];
      return {
        orderId: o._id,
        title: o.title || `Order #${o._id}`,
        status: o.status,
        buyer: o.recruiterId,
        seller: o.createdBy,
        reason: latest && latest.reason ? latest.reason : "",
        declinedBy:
          latest && latest.declinedByName ? latest.declinedByName : "Unknown",
        declinedAt:
          latest && (latest.decidedAt || latest.requestedAt)
            ? latest.decidedAt || latest.requestedAt
            : null,
        declinedById: latest && latest.declinedBy ? latest.declinedBy : null,
        cancellationStatus: "admin_review",
        requiresAdminDecision: true,
        attachments: latest && latest.attachments ? latest.attachments : [],
      };
    });

    return res.status(httpStatus.OK).send({ success: true, data });
  } catch (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .send({ success: false, message: error.message });
  }
};

// Admin: Accept cancellation request and process refund
const adminAcceptCancellation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { adminReason } = req.body;
    const adminId = req.user._id;

    // Get order with cancellation details
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(httpStatus.NOT_FOUND).send({
        success: false,
        message: "Order not found",
      });
    }

    // Find the latest cancellation request under admin review
    const adminReviewCancellation = (order.cancellations || [])
      .filter((c) => c.status === "admin_review")
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))[0];

    if (!adminReviewCancellation) {
      return res.status(httpStatus.BAD_REQUEST).send({
        success: false,
        message:
          "No cancellation request under admin review found for this order",
      });
    }

    // Check if order has payment to refund
    const hasPayment = order.payment && order.payment.status === "completed";

    if (hasPayment) {
      // Process refund through Stripe
      try {
        const refundResult = await stripeService.refundPayment({
          paymentIntentId: order.payment.paymentId,
          amount: order.payment.amount * 100, // Convert to cents
          reason: "requested_by_customer",
          metadata: {
            orderId: orderId,
            refundReason: "Admin approved cancellation",
            adminId: adminId.toString(),
          },
        });

        console.log("Refund processed:", refundResult);

        // Update payment record with refund info
        order.payment.refund = {
          refundId: refundResult.id,
          amount: refundResult.amount / 100, // Convert back to dollars
          status: refundResult.status,
          processedAt: new Date(),
          processedBy: adminId,
          reason: "Admin approved cancellation",
        };
        order.payment.status = "refunded";
      } catch (refundError) {
        console.error("Refund processing error:", refundError);
        return res.status(httpStatus.BAD_REQUEST).send({
          success: false,
          message: `Failed to process refund: ${refundError.message}`,
        });
      }
    }

    // Update cancellation status to accepted
    adminReviewCancellation.status = "accepted";
    adminReviewCancellation.decidedAt = new Date();
    adminReviewCancellation.decidedBy = adminId;
    adminReviewCancellation.adminReason =
      adminReason || "Admin approved cancellation";

    // Update order status to cancelled
    order.status = "cancel";
    order.cancelledAt = new Date();
    order.cancelledBy = adminId;

    // Add admin activity
    order.activities = order.activities || [];
    order.activities.push({
      action: "cancellation_accepted_by_admin",
      by: adminId,
      note: adminReason || "Admin approved cancellation request",
      fromStatus: order.status,
      toStatus: "cancel",
      meta: {
        refundProcessed: hasPayment,
        cancellationId: adminReviewCancellation._id,
      },
    });

    // Process balance refund for the buyer
    const { orderService } = require("../services");
    await orderService.processCancellationRefund(order, adminId);

    await order.save();

    // Chat notifications removed - not requested

    return res.status(httpStatus.OK).send({
      success: true,
      message: "Cancellation accepted and refund processed",
      order: {
        id: order._id,
        status: order.status,
        refundProcessed: hasPayment,
      },
    });
  } catch (error) {
    console.error("Admin accept cancellation error:", error);
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: error.message,
    });
  }
};

// Admin: Reject cancellation request
const adminRejectCancellation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { adminReason } = req.body;
    const adminId = req.user._id;

    // Get order with cancellation details
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(httpStatus.NOT_FOUND).send({
        success: false,
        message: "Order not found",
      });
    }

    // Find the latest cancellation request under admin review
    const adminReviewCancellation = (order.cancellations || [])
      .filter((c) => c.status === "admin_review")
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))[0];

    if (!adminReviewCancellation) {
      return res.status(httpStatus.BAD_REQUEST).send({
        success: false,
        message:
          "No cancellation request under admin review found for this order",
      });
    }

    // Update cancellation status to rejected
    adminReviewCancellation.status = "declined";
    adminReviewCancellation.decidedAt = new Date();
    adminReviewCancellation.decidedBy = adminId;
    adminReviewCancellation.adminReason =
      adminReason || "Admin rejected cancellation";

    // Add admin activity
    order.activities = order.activities || [];
    order.activities.push({
      action: "cancellation_rejected_by_admin",
      by: adminId,
      note: adminReason || "Admin rejected cancellation request",
      meta: {
        cancellationId: adminReviewCancellation._id,
        originalReason: adminReviewCancellation.reason,
      },
    });

    await order.save();

    // Chat notifications removed - not requested

    return res.status(httpStatus.OK).send({
      success: true,
      message: "Cancellation request rejected",
      order: {
        id: order._id,
        status: order.status,
      },
    });
  } catch (error) {
    console.error("Admin reject cancellation error:", error);
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: error.message,
    });
  }
};

// Request revision on a submitted delivery (payload: message + files; all files supported)
const requestDeliveryRevision = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body; // expects `message` per API contract
    const userId = req.user._id;
    const order = await Order.findById(orderId);
    if (!order)
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ message: "Order not found" });
    const uid = userId.toString();
    const createdByStr = order.createdBy ? order.createdBy.toString() : null;
    const recruiterStr = order.recruiterId
      ? order.recruiterId.toString()
      : null;
    if (uid !== createdByStr && uid !== recruiterStr) {
      return res
        .status(httpStatus.FORBIDDEN)
        .send({ message: "Not allowed to request revision for this order" });
    }

    // Handle optional files: upload all to S3 (all file types accepted by uploader)
    const uploadedFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const s3Result = await uploadFileToS3(file, uid);
          uploadedFiles.push({
            filename: file.originalname,
            url: s3Result.url,
            uploadedAt: new Date(),
            downloadCount: 0,
          });
        } catch (uploadError) {
          console.error("Error uploading revision file to S3:", uploadError);
          return res.status(httpStatus.BAD_REQUEST).send({
            message: `Failed to upload file ${file.originalname}: ${uploadError.message}`,
          });
        }
      }
    }

    // Store uploaded files along with other delivery files
    if (uploadedFiles.length > 0) {
      order.deliveryFiles = order.deliveryFiles || [];
      order.deliveryFiles.push(...uploadedFiles);
    }

    const note = message || "Revision requested";

    // Log an activity with file links
    order.activities = order.activities || [];
    order.activities.push({
      action: "delivery_revision_requested",
      by: userId,
      note,
      fromStatus: order.status,
      toStatus: "revision",
      meta: {
        filesUploaded: uploadedFiles.map((f) => ({
          filename: f.filename,
          url: f.url,
        })),
      },
    });

    // Set status to revision
    order.status = "revision";
    await order.save();

    // Per requirement, do not push activity to chat messages for revision requests
    return res.status(httpStatus.OK).send(order);
  } catch (error) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
  }
};

// Get order payment details with calculated fees
const getOrderPaymentDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.user._id;

    // Get order details
    const order = await Order.findById(orderId).populate("gig");
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Check if user has permission to view this order
    const isCreator = order.createdBy.toString() === userId.toString();
    const isRecruiter =
      order.recruiterId && order.recruiterId.toString() === userId.toString();

    if (!isCreator && !isRecruiter) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Not authorized to view this order",
      );
    }

    // Calculate fees using the fee calculator
    const orderAmount = parseFloat(order.price);
    const buyerPayment = calculateBuyerPayment(orderAmount);
    const sellerPayout = calculateSellerPayout(orderAmount);

    // Get image from Gig if available
    let orderImage = "/image/default-picture.jpg";
    if (order.gig) {
      if (order.gig.images && order.gig.images.length > 0) {
        orderImage = order.gig.images[0];
      } else if (order.gig.gigImages && order.gig.gigImages.length > 0) {
        orderImage = order.gig.gigImages[0];
      }
    }

    // Return order details with calculated fees
    res.status(httpStatus.OK).send({
      success: true,
      order: {
        id: order._id,
        title: order.title,
        description: order.description,
        price: order.price,
        status: order.status,
        delivery_time: order.delivery_time,
        createdBy: order.createdBy,
        recruiterId: order.recruiterId,
        createdAt: order.createdAt,
        image: orderImage,
      },
      fees: {
        buyer: buyerPayment,
        seller: sellerPayout,
        breakdown: {
          orderAmount: orderAmount,
          platformFee: buyerPayment.platformFee,
          flatFee: buyerPayment.flatFee,
          totalAmount: buyerPayment.totalAmount,
          sellerReceives: sellerPayout.netAmount,
        },
      },
    });
  } catch (error) {
    console.error("Error getting order payment details:", error);
    res.status(error.statusCode || httpStatus.BAD_REQUEST).send({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createOrder,
  getOrder,
  updateOrderStatus,
  acceptOrder,
  declineOrder,
  processOrderPayment,
  addReviewAndRating,
  getMyOrders,
  getCompletedOrders,
  sendOrderMessage,
  requestExtension,
  decideExtension,
  extendDelivery,
  requestCancellation,
  decideCancellation,
  directCancelOrder,
  checkCancellationEligibility,
  submitDelivery,
  acceptDelivery,
  requestDeliveryRevision,
  getRejectedCancellationOrders,
  adminAcceptCancellation,
  adminRejectCancellation,
  createPaypalOrder,
  capturePaypalOrder,
  getOrderPaymentDetails,
};
