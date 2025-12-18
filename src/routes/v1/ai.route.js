const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const aiValidation = require('../../validations/ai.validation');
const aiController = require('../../controllers/ai.controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiter for AI autofill - 10 requests per hour per user
const aiAutofillLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Please try again later.',
      error: 'RATE_LIMIT_EXCEEDED'
    });
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user ? req.user.id : req.ip;
  }
});

router
  .route('/autofill')
  .post(
    auth(), // Requires authentication
    aiAutofillLimiter,
    validate(aiValidation.generateAutofill),
    aiController.generateAutofill
  );

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: AI
 *   description: AI-powered features
 */

/**
 * @swagger
 * /ai/autofill:
 *   post:
 *     summary: Generate AI-powered tags and description
 *     description: Generate relevant tags and professional description based on title, category, and work images using OpenAI GPT
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 200
 *                 description: Title of the creative work
 *               category:
 *                 type: string
 *                 maxLength: 100
 *                 description: Category of the work
 *               subcategory:
 *                 type: string
 *                 maxLength: 100
 *                 description: Subcategory of the work
 *               workImages:
 *                 type: array
 *                 maxItems: 10
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Array of image URLs
 *             example:
 *               title: Modern Web Design Homepage
 *               category: UI/UX Design
 *               subcategory: Website Design
 *               workImages:
 *                 - https://example.com/uploads/image1.jpg
 *     responses:
 *       "200":
 *         description: Successfully generated autofill data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: 5-8 relevant tags
 *                 description:
 *                   type: string
 *                   description: Professional description (50-500 characters)
 *               example:
 *                 success: true
 *                 tags:
 *                   - web design
 *                   - modern ui
 *                   - homepage design
 *                   - responsive layout
 *                   - clean interface
 *                 description: A modern and clean web design homepage featuring a responsive layout with intuitive navigation.
 *       "400":
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 *       "401":
 *         description: Unauthorized
 *       "429":
 *         description: Rate limit exceeded
 *       "500":
 *         description: Internal server error
 */
