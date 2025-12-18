const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Chat } = require('../models');
const mongoose = require('mongoose');

// AWS SDK v3 setup
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Attachment Cleanup Service
 * Handles automatic deletion of expired chat attachments
 */
const AttachmentCleanupService = {
  /**
   * Find and delete expired attachments
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupExpiredAttachments() {
    try {
      const now = new Date();
      console.log(`Starting attachment cleanup at ${now.toISOString()}`);

      // Find all chats with expired attachments
      const chatsWithExpiredAttachments = await Chat.find({
        'messages.attachments.expiresAt': { $lt: now }
      });

      let deletedCount = 0;
      let errorCount = 0;
      const deletedFiles = [];
      const errors = [];

      for (const chat of chatsWithExpiredAttachments) {
        // Process each message in the chat
        for (let messageIndex = 0; messageIndex < chat.messages.length; messageIndex++) {
          const message = chat.messages[messageIndex];
          
          if (message.attachments && message.attachments.length > 0) {
            // Filter out expired attachments and collect them for deletion
            const expiredAttachments = message.attachments.filter(
              attachment => attachment.expiresAt && attachment.expiresAt < now
            );

            // Delete expired attachments from S3
            for (const attachment of expiredAttachments) {
              try {
                // Extract S3 key from URL or use filename
                const s3Key = attachment.filename || this.extractS3KeyFromUrl(attachment.url);
                
                if (s3Key) {
                  await this.deleteFromS3(s3Key);
                  deletedFiles.push({
                    chatId: chat._id,
                    messageIndex,
                    filename: attachment.originalName,
                    s3Key,
                    expiredAt: attachment.expiresAt
                  });
                  deletedCount++;
                }
              } catch (error) {
                console.error(`Error deleting attachment ${attachment.originalName}:`, error);
                errors.push({
                  chatId: chat._id,
                  messageIndex,
                  filename: attachment.originalName,
                  error: error.message
                });
                errorCount++;
              }
            }

            // Remove expired attachments from the message
            message.attachments = message.attachments.filter(
              attachment => !attachment.expiresAt || attachment.expiresAt >= now
            );
          }
        }

        // Save the updated chat document
        chat.markModified('messages');
        await chat.save();
      }

      const result = {
        timestamp: now.toISOString(),
        chatsProcessed: chatsWithExpiredAttachments.length,
        attachmentsDeleted: deletedCount,
        errors: errorCount,
        deletedFiles,
        errorDetails: errors
      };

      console.log('Attachment cleanup completed:', result);
      return result;

    } catch (error) {
      console.error('Error during attachment cleanup:', error);
      throw error;
    }
  },

  /**
   * Delete a file from S3
   * @param {string} s3Key - The S3 object key
   */
  async deleteFromS3(s3Key) {
    const deleteParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
    };

    await s3.send(new DeleteObjectCommand(deleteParams));
    console.log(`Deleted from S3: ${s3Key}`);
  },

  /**
   * Extract S3 key from full S3 URL
   * @param {string} url - Full S3 URL
   * @returns {string} S3 key
   */
  extractS3KeyFromUrl(url) {
    try {
      const urlParts = url.split('/');
      const bucketIndex = urlParts.findIndex(part => part.includes('.s3.'));
      if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
        return urlParts.slice(bucketIndex + 1).join('/');
      }
      return null;
    } catch (error) {
      console.error('Error extracting S3 key from URL:', url, error);
      return null;
    }
  },

  /**
   * Get statistics about attachments and their expiration
   * @returns {Promise<Object>} Statistics
   */
  async getAttachmentStatistics() {
    try {
      const now = new Date();
      
      // Aggregate statistics
      const stats = await Chat.aggregate([
        { $unwind: '$messages' },
        { $unwind: '$messages.attachments' },
        {
          $group: {
            _id: null,
            totalAttachments: { $sum: 1 },
            expiredAttachments: {
              $sum: {
                $cond: [
                  { $lt: ['$messages.attachments.expiresAt', now] },
                  1,
                  0
                ]
              }
            },
            totalSize: { $sum: '$messages.attachments.size' },
            averageSize: { $avg: '$messages.attachments.size' }
          }
        }
      ]);

      return stats[0] || {
        totalAttachments: 0,
        expiredAttachments: 0,
        totalSize: 0,
        averageSize: 0
      };
    } catch (error) {
      console.error('Error getting attachment statistics:', error);
      throw error;
    }
  },

  /**
   * Schedule cleanup to run periodically
   * @param {number} intervalHours - Hours between cleanup runs (default: 24)
   */
  scheduleCleanup(intervalHours = 24) {
    const intervalMs = intervalHours * 60 * 60 * 1000; // Convert to milliseconds
    
    console.log(`Scheduling attachment cleanup to run every ${intervalHours} hours`);
    
    // Run cleanup immediately
    this.cleanupExpiredAttachments().catch(error => {
      console.error('Initial cleanup failed:', error);
    });

    // Schedule periodic cleanup
    setInterval(async () => {
      try {
        await this.cleanupExpiredAttachments();
      } catch (error) {
        console.error('Scheduled cleanup failed:', error);
      }
    }, intervalMs);
  }
};

module.exports = AttachmentCleanupService;
