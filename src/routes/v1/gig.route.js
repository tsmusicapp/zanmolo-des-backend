const express = require('express');
const auth = require('../../middlewares/auth');
const { optionalAuth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const gigValidation = require('../../validations/gig.validation');
const gigController = require('../../controllers/gig.controller');
const { upload } = require('../../utils/s3Upload');
const { uploadChatAttachment } = require('../../middlewares/upload');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for creation endpoints (disabled for development)
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // increased limit for development
  message: 'Too many gig creation attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development', // skip in development
});

// Public routes (no auth required)
// Gig video upload route
router.route('/upload-video')
  .post(auth(), uploadChatAttachment.single('video'), gigController.uploadGigVideo);

// Gig image upload route
router.route('/upload-image')
  .post(auth(), uploadChatAttachment.single('image'), gigController.uploadGigImage);

router.route('/categories')
  .get(gigController.getGigCategories);

router.route('/search')
  .get(optionalAuth(), validate(gigValidation.getGigs), gigController.searchGigs);

router.route('/featured')
  .get(optionalAuth(), validate(gigValidation.getGigs), gigController.getFeaturedGigs);

router.route('/popular')
  .get(optionalAuth(), validate(gigValidation.getGigs), gigController.getPopularGigs);

// Public gig listing and details
router.route('/')
  .post(auth(), createLimiter, validate(gigValidation.createGig), gigController.createGig)
  .get(optionalAuth(), validate(gigValidation.getGigs), gigController.getGigs);

router.route('/:gigId')
  .get(optionalAuth(), validate(gigValidation.getGig), gigController.getGig)
  .put(auth(), validate(gigValidation.updateGig), gigController.updateGig)
  .delete(auth(), validate(gigValidation.deleteGig), gigController.deleteGig);

// Gig reviews
router.route('/:gigId/reviews')
  .get(optionalAuth(), validate(gigValidation.getGig), gigController.getGigReviews)
  .post(auth(), validate(gigValidation.addGigReview), gigController.addGigReview);

// Gig actions
router.route('/:gigId/favorite')
  .post(auth(), validate(gigValidation.favoriteGig), gigController.favoriteGig);

router.route('/:gigId/report')
  .post(auth(), validate(gigValidation.reportGig), gigController.reportGig);

// Gig status management (for sellers and admin)
router.route('/:gigId/status')
  .put(auth(), validate(gigValidation.updateGigStatus), gigController.updateGigStatus);

// Gig analytics (for sellers)
router.route('/:gigId/stats')
  .get(auth(), validate(gigValidation.getGigStats), gigController.getGigStats);

// User's gigs
router.route('/my/gigs')
  .get(auth(), validate(gigValidation.getMyGigs), gigController.getMyGigs);

router.route('/my/favorites')
  .get(auth(), gigController.getMyFavoriteGigs);

router.route('/my/analytics')
  .get(auth(), gigController.getSellerGigAnalytics);

// User gigs by ID (public)
router.route('/user/:userId')
  .get(optionalAuth(), validate(gigValidation.getGigsByUser), gigController.getGigsByUser);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Gigs
 *   description: Gig management and marketplace
 */

/**
 * @swagger
 * /gigs:
 *   post:
 *     summary: Create a new gig
 *     description: Create a new service gig for the marketplace
 *     tags: [Gigs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - category
 *               - subcategory
 *               - description
 *               - packages
 *               - videos
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 80
 *               category:
 *                 type: string
 *                 enum: [music-production, mixing-mastering, songwriting, vocal-recording, beat-making, lyrics-writing, voice-over, podcast-editing, sound-design, jingle-creation, instruments, composition, vocals, audio-engineering, 3D Design, Architecture, Interior Design, Industrial Design, Home & Lifestyle Product Design, Landscape Design, Urban Design, Exhibition & Experience Design, Transportation Design, Game & Film Environment Design, BIM & Parametric Design, Video Design, other]
 *               subcategory:
 *                 type: string
 *               description:
 *                 type: string
 *                 maxLength: 1200
 *               packages:
 *                 type: object
 *               videos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Gig'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "429":
 *         $ref: '#/components/responses/TooManyRequests'
 *   get:
 *     summary: Get all gigs
 *     description: Retrieve all active gigs with filtering and pagination
 *     tags: [Gigs]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: subcategory
 *         schema:
 *           type: string
 *         description: Filter by subcategory
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *       - in: query
 *         name: deliveryTime
 *         schema:
 *           type: number
 *         description: Maximum delivery time in days
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, oldest, price_low, price_high, rating, popular]
 *         description: Sort by field
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Maximum number of results per page
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
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
 *                     $ref: '#/components/schemas/Gig'
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalResults:
 *                   type: integer
 */

/**
 * @swagger
 * /gigs/{gigId}:
 *   get:
 *     summary: Get a gig by ID
 *     description: Retrieve detailed information about a specific gig
 *     tags: [Gigs]
 *     parameters:
 *       - in: path
 *         name: gigId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gig ID
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Gig'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     summary: Update a gig
 *     description: Update gig information (only by seller)
 *     tags: [Gigs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gigId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gig ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               packages:
 *                 type: object
 *               videos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Gig'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     summary: Delete a gig
 *     description: Delete a gig (only by seller)
 *     tags: [Gigs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gigId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gig ID
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /gigs/my/gigs:
 *   get:
 *     summary: Get my gigs
 *     description: Retrieve all gigs created by the authenticated user
 *     tags: [Gigs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, paused, denied]
 *         description: Filter by status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, oldest, rating, popular]
 *         description: Sort by field
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Maximum number of results per page
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
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
 *                     $ref: '#/components/schemas/Gig'
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalResults:
 *                   type: integer
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Gig:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         category:
 *           type: string
 *         subcategory:
 *           type: string
 *         description:
 *           type: string
 *         packages:
 *           type: object
 *           properties:
 *             basic:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 *                 price:
 *                   type: number
 *                 deliveryTime:
 *                   type: number
 *                 revisions:
 *                   type: number
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *         seller:
 *           $ref: '#/components/schemas/User'
 *         status:
 *           type: string
 *           enum: [draft, active, paused, denied]
 *         averageRating:
 *           type: number
 *         totalOrders:
 *           type: number
 *         totalReviews:
 *           type: number
 *         videos:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
