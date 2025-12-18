const AttachmentCleanupService = require('../services/attachmentCleanup.service');

/**
 * Manual cleanup of expired attachments
 */
const cleanupExpiredAttachments = async (req, res) => {
  try {
    const result = await AttachmentCleanupService.cleanupExpiredAttachments();
    
    res.status(200).json({
      success: true,
      message: 'Attachment cleanup completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Error during manual cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup expired attachments',
      error: error.message
    });
  }
};

/**
 * Get attachment statistics
 */
const getAttachmentStatistics = async (req, res) => {
  try {
    const stats = await AttachmentCleanupService.getAttachmentStatistics();
    
    res.status(200).json({
      success: true,
      message: 'Attachment statistics retrieved successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error getting attachment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get attachment statistics',
      error: error.message
    });
  }
};

module.exports = {
  cleanupExpiredAttachments,
  getAttachmentStatistics
};
