const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const reportValidation = require('../../validations/report.validation');
const reportController = require('../../controllers/report.controller');

const router = express.Router();

/**
 * @swagger
 * /v1/reports/blog/{blogId}:
 *   post:
 *     summary: Report a blog
 *     description: Users can report inappropriate blogs
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: blogId
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       "201":
 *         description: Blog reported successfully
 *       "400":
 *         description: Bad request
 *       "401":
 *         description: Unauthorized
 *       "404":
 *         description: Blog not found
 */
router.post('/blog/:blogId', auth(), validate(reportValidation.createBlogReport), reportController.createBlogReport);

/**
 * @swagger
 * /v1/reports:
 *   get:
 *     summary: Get all reports (Admin only)
 *     description: Admin can view all reports
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [user, music, lyrics, assets, job, blog]
 *         description: Filter by report type
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 */
router.get('/', auth('manageUsers'), validate(reportValidation.getReports), reportController.getReports);

/**
 * @swagger
 * /v1/reports/{reportId}:
 *   delete:
 *     summary: Delete a report (Admin only)
 *     description: Admin can delete reports
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ID
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 *       "404":
 *         description: Report not found
 */
router.delete('/:reportId', auth('manageUsers'), validate(reportValidation.deleteReport), reportController.deleteReport);

module.exports = router;
