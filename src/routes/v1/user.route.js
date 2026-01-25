const express = require("express");
const auth = require("../../middlewares/auth");
const validate = require("../../middlewares/validate");
const userValidation = require("../../validations/user.validation");
const userController = require("../../controllers/user.controller");
const { optionalAuth } = require("../../middlewares/auth");

const router = express.Router();

router
  .route("/")
  .post(
    auth("admin"),
    validate(userValidation.createUser),
    userController.createUser,
  )
  .get(
    auth("admin"),
    validate(userValidation.getUsers),
    userController.getUsers,
  );

// PayPal Connect routes - MUST be before /:userId route to avoid conflicts
router
  .route("/paypal-connection")
  .get(auth("user"), userController.getPaypalConnection);
router
  .route("/paypal-connect-url")
  .post(auth("user"), userController.getPaypalConnectUrl);
router
  .route("/paypal-connect")
  .post(auth("user"), userController.connectPaypal);
router
  .route("/paypal-disconnect")
  .delete(auth("user"), userController.disconnectPaypal);

router.route("/admin/all").get(auth("user"), userController.getAllUsersAdmin); // Auth user, role admin dicek di controller

// Cancel account with 10-day grace period - MUST be before /:userId route
router
  .route("/cancel-account")
  .post(auth("user"), userController.cancelAccount);

router
  .route("/:userId")
  .get(auth("admin"), validate(userValidation.getUser), userController.getUser)
  .patch(
    auth("admin"),
    validate(userValidation.updateUser),
    userController.updateUser,
  )
  .delete(
    auth("admin"),
    validate(userValidation.deleteUser),
    userController.deleteUser,
  )
  .post(auth("user"), userController.followUser); // Only authenticated users can follow
router
  .route("/follow/:userId")
  .post(auth("recruiter", "user"), userController.followUser); // Only authenticated users can follow
router
  .route("/follow/:userId")
  .delete(auth("recruiter", "user"), userController.unfollowUser); // Only authenticated users can follow

router.route("/me/following").get(auth("user"), userController.getMyFollowing); // Only authenticated users can get their following list

router
  .route("/admin/delete")
  .post(auth("user"), userController.deleteUsersAdmin); // Hapus satu/banyak user (admin only)

router
  .route("/admin/send-message")
  .post(auth("user"), userController.sendMessageAdmin); // Kirim pesan ke satu/banyak user (admin only)

router.route("/admin/block").post(auth("user"), userController.blockUserAdmin); // Blokir user (admin only)
router
  .route("/admin/unblock")
  .post(auth("user"), userController.unblockUserAdmin); // Unblock user (admin only)

router
  .route("/get-user-by-id/:userId")
  .get(optionalAuth(), userController.getUserByIdPublic); // Optional auth

// Get current user's saved billing information
router.route("/me/billing").get(auth("user"), userController.getMyBilling);

// Get current user info
router.route("/me").get(auth("user"), userController.getMe);

// Get current user's wallet balance
router.route("/me/balance").get(auth("user"), userController.getMyBalance);

// Get current user's transaction history
router
  .route("/me/transactions")
  .get(auth("user"), userController.getMyTransactions);

// Get transaction statistics for current user
router
  .route("/me/transactions/stats")
  .get(auth("user"), userController.getMyTransactionStats);

// Process withdrawal request (PayPal Payout)
router
  .route("/me/withdraw")
  .post(auth("user"), userController.processWithdrawal);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and retrieval
 */

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a user
 *     description: Only admins can create other users.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - role
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *                 description: must be unique
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: At least one number and one letter
 *               role:
 *                  type: string
 *                  enum: [user, admin]
 *             example:
 *               name: fake name
 *               email: fake@example.com
 *               password: password1
 *               role: user
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/User'
 *       "400":
 *         $ref: '#/components/responses/DuplicateEmail'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *
 *   get:
 *     summary: Get all users
 *     description: Only admins can retrieve all users.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: User name
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: User role
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: sort by query in the form of field:desc/asc (ex. name:asc)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         default: 10
 *         description: Maximum number of users
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *                 totalPages:
 *                   type: integer
 *                   example: 1
 *                 totalResults:
 *                   type: integer
 *                   example: 1
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a user
 *     description: Logged in users can fetch only their own user information. Only admins can fetch other users.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User id
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/User'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     summary: Update a user
 *     description: Logged in users can only update their own information. Only admins can update other users.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *                 description: must be unique
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: At least one number and one letter
 *             example:
 *               name: fake name
 *               email: fake@example.com
 *               password: password1
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/User'
 *       "400":
 *         $ref: '#/components/responses/DuplicateEmail'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     summary: Delete a user
 *     description: Logged in users can delete only themselves. Only admins can delete other users.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User id
 *     responses:
 *       "200":
 *         description: No content
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
