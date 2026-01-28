const express = require("express");
const auth = require("../../middlewares/auth");
const { orderController } = require("../../controllers");
const { upload } = require("../../utils/s3Upload");

const router = express.Router();

router.post("/create", auth("user"), orderController.createOrder);

// Purchase endpoint (compatibility with frontend POST /v1/order/purchase)
const { purchaseController } = require("../../controllers");
router.post("/purchase", auth("user"), purchaseController.createPurchase);

router.get("/sales", auth("user"), orderController.getCompletedOrders);

router.get(
  "/my/orders",
  auth("user", "recruiter"),
  orderController.getMyOrders,
);

// Admin routes for cancellation management (must be before :orderId routes)
router.get(
  "/cancellations/rejected",
  auth("admin"),
  orderController.getRejectedCancellationOrders,
);

// Get an order by ID - moved after specific routes to avoid conflicts
router.get(
  "/details/:orderId",
  auth("user", "recruiter"),
  orderController.getOrder,
);

router.get("/reviews/user/:userId", orderController.getUserSellerReviews);

// Update order status
router.put(
  "/:orderId/status",
  auth("user", "recruiter"),
  orderController.updateOrderStatus,
);

// Accept order - specific endpoint for accepting order requests
router.put(
  "/:orderId/accept",
  auth("user", "recruiter"),
  orderController.acceptOrder,
);

// Get order payment details with calculated fees
router.get(
  "/:orderId/payment-details",
  auth("user", "recruiter"),
  orderController.getOrderPaymentDetails,
);

// Order payment - process payment before accepting order
router.post(
  "/:orderId/payment",
  auth("user", "recruiter"),
  orderController.processOrderPayment,
);

// PayPal Checkout routes
router.post(
  "/:orderId/paypal/create-order",
  auth("user", "recruiter"),
  orderController.createPaypalOrder,
);
router.post(
  "/:orderId/paypal/capture-order",
  auth("user", "recruiter"),
  orderController.capturePaypalOrder,
);

// Decline order - specific endpoint for declining order requests
router.put(
  "/:orderId/decline",
  auth("user", "recruiter"),
  orderController.declineOrder,
);

router.post(
  "/:orderId/review",
  auth("user", "recruiter"),
  orderController.addReviewAndRating,
);

router.post(
  "/:orderId/review-reply",
  auth("user", "recruiter"),
  orderController.replyToBuyerReview,
);

// Send message tied to order and record in activities
router.post(
  "/:orderId/message",
  auth("user", "recruiter"),
  orderController.sendOrderMessage,
);

// Request to extend delivery duration (pending approval) and record in activities
router.post(
  "/:orderId/extend-delivery",
  auth("user", "recruiter"),
  orderController.extendDelivery,
);

// Request an extension (approval flow)
router.post(
  "/:orderId/extend/request",
  auth("user", "recruiter"),
  orderController.requestExtension,
);

// Decide on a requested extension (accept/decline)
router.post(
  "/:orderId/extend/decide",
  auth("user", "recruiter"),
  orderController.decideExtension,
);

// Request cancellation (pending approval) and record in activities (supports file uploads)
router.post(
  "/:orderId/request-cancellation",
  upload.any(),
  auth("user", "recruiter"),
  orderController.requestCancellation,
);

// Decide latest pending cancellation (accept/decline)
router.post(
  "/:orderId/cancel/decide",
  auth("user", "recruiter"),
  orderController.decideCancellation,
);

// Direct cancellation (immediate cancellation without approval)
router.post(
  "/:orderId/cancel/direct",
  auth("user", "recruiter"),
  orderController.directCancelOrder,
);

// Check if order can be cancelled
router.get(
  "/:orderId/cancel/eligibility",
  auth("user", "recruiter"),
  orderController.checkCancellationEligibility,
);

// Delivery approval flow
router.post(
  "/:orderId/deliver",
  upload.array("deliveryFiles", 10),
  auth("user", "recruiter"),
  orderController.submitDelivery,
);
router.post(
  "/:orderId/deliver/accept",
  auth("user", "recruiter"),
  orderController.acceptDelivery,
);
router.post(
  "/:orderId/deliver/revision",
  upload.any(),
  auth("user", "recruiter"),
  orderController.requestDeliveryRevision,
);

// Admin routes for cancellation management (accept/reject)
router.post(
  "/:orderId/admin/accept-cancellation",
  auth("admin"),
  orderController.adminAcceptCancellation,
);
router.post(
  "/:orderId/admin/reject-cancellation",
  auth("admin"),
  orderController.adminRejectCancellation,
);

module.exports = router;
