const express = require('express');
const router = express.Router();
const attachmentCleanupController = require('../../controllers/attachmentCleanup.controller');
const auth = require('../../middlewares/auth');

// Manual cleanup of expired attachments (admin only)
router.post('/cleanup', auth('admin'), attachmentCleanupController.cleanupExpiredAttachments);

// Get attachment statistics (admin only)
router.get('/statistics', auth('admin'), attachmentCleanupController.getAttachmentStatistics);

module.exports = router;
