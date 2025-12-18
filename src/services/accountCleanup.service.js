const User = require('../models/user.model');
const UserSpace = require('../models/userSpace.model');
const Music = require('../models/music.model');
const LyricsMusic = require('../models/lyrics.model');
const ShareMusicAsset = require('../models/shareMusicAsset.model');
const Job = require('../models/job.model');
const AppliedJobs = require('../models/appliedJobs.model');
const Chat = require('../models/chat.model');
const Order = require('../models/order.model');
const Gig = require('../models/gig.model');
const { Blog } = require('../models');
const Transaction = require('../models/transaction.model');
const Cart = require('../models/cart.model');
const ContactUs = require('../models/contactUs.model');
const Purchase = require('../models/purchase.model');
const Report = require('../models/report.model');
const Sale = require('../models/sale.model');
const ShareMusicCreation = require('../models/shareMusicCreation.model');
const Token = require('../models/token.model');
const TrackChunks = require('../models/trackChunks.model');
const TrackFiles = require('../models/trackFiles.model');

/**
 * Service for handling account cleanup and data deletion
 */
class AccountCleanupService {
  
  /**
   * Process accounts scheduled for deletion
   * This should be called by a cron job daily
   */
  static async processScheduledDeletions() {
    try {
      console.log('Starting account cleanup process...');
      
      // Find all users scheduled for deletion
      const usersToDelete = await User.find({
        accountStatus: 'cancelled',
        accountDeletionScheduledFor: { $lte: new Date() }
      });


      let deletedCount = 0;
      let errorCount = 0;

      for (const user of usersToDelete) {
        try {
          await this.deleteUserData(user._id);
          
          // Actually delete the user record from the database
          await User.findByIdAndDelete(user._id);
          
          deletedCount++;
          
        } catch (error) {
          errorCount++;
          console.error(`Error deleting account for user ${user._id}:`, error);
        }
      }

      
      return {
        success: true,
        deletedCount,
        errorCount,
        totalProcessed: usersToDelete.length
      };

    } catch (error) {
      console.error('Account cleanup process failed:', error);
      throw error;
    }
  }

  /**
   * Delete all data associated with a user
   * @param {string} userId - The user ID to delete data for
   */
  static async deleteUserData(userId) {
    try {

      // Delete user's content
      await Promise.all([
        // Delete user's music
        Music.deleteMany({ createdBy: userId }),
        
        // Delete user's lyrics
        LyricsMusic.deleteMany({ createdBy: userId }),
        
        // Delete user's shared assets
        ShareMusicAsset.deleteMany({ createdBy: userId }),
        
        // Delete user's jobs
        Job.deleteMany({ createdBy: userId }),
        
        // Delete user's gigs
        Gig.deleteMany({ seller: userId }),
        
        // Delete user's blogs
        Blog.deleteMany({ createdBy: userId }),
        
        // Delete user's userSpace
        UserSpace.deleteMany({ createdBy: userId }),
        
        // Delete user's transactions
        Transaction.deleteMany({ userId: userId }),
        
        // Delete user's cart items
        Cart.deleteMany({ userId: userId }),
        
        // Delete user's contact us messages
        ContactUs.deleteMany({ userId: userId }),
        
        // Delete user's purchases
        Purchase.deleteMany({ userId: userId }),
        
        // Delete user's sales
        Sale.deleteMany({ sellerId: userId }),
        
        // Delete user's reports (both as reporter and reported)
        Report.deleteMany({ 
          $or: [
            { userId: userId },
            { reportedUserId: userId }
          ]
        }),
        
        // Delete user's share music creations
        ShareMusicCreation.deleteMany({ createdBy: userId }),
        
        // Delete user's tokens
        Token.deleteMany({ userId: userId }),
        
        // Delete user's track chunks
        TrackChunks.deleteMany({ userId: userId }),
        
        // Delete user's track files
        TrackFiles.deleteMany({ userId: userId }),
        
        // Delete chats involving this user
        Chat.deleteMany({ 
          $or: [
            { senderId: userId },
            { receiverId: userId }
          ]
        }),
        
        // Update orders to remove user references
        Order.updateMany(
          { recruiterId: userId },
          { 
            $unset: { 
              recruiterId: 1,
              recruiterName: 1,
              recruiterEmail: 1
            }
          }
        ),
        
        // Update orders where user was the seller
        Order.updateMany(
          { sellerId: userId },
          { 
            $unset: { 
              sellerId: 1,
              sellerName: 1,
              sellerEmail: 1
            }
          }
        ),
        
        // Remove user from other users' following lists
        User.updateMany(
          { following: userId },
          { $pull: { following: userId } }
        ),
        
        // Remove user from other users' likedSongs
        User.updateMany(
          { likedSongs: userId },
          { $pull: { likedSongs: userId } }
        ),
        
        // Remove user from other users' blockedUsers
        User.updateMany(
          { blockedUsers: userId },
          { $pull: { blockedUsers: userId } }
        ),
        
        // Remove user from music likes
        Music.updateMany(
          { likes: userId },
          { $pull: { likes: userId } }
        ),
        
        // Remove user from lyrics likes
        LyricsMusic.updateMany(
          { likes: userId },
          { $pull: { likes: userId } }
        ),
        
        // Remove user from shared assets likes
        ShareMusicAsset.updateMany(
          { likes: userId },
          { $pull: { likes: userId } }
        ),
        
        // Delete applied jobs
        AppliedJobs.deleteMany({ applicantId: userId }),
        
        // Update applied jobs to remove user references
        AppliedJobs.updateMany(
          { applicantId: userId },
          { 
            $unset: { 
              applicantId: 1,
              applicantName: 1,
              applicantEmail: 1
            }
          }
        ),
        
        // Remove user from gig likes
        Gig.updateMany(
          { likes: userId },
          { $pull: { likes: userId } }
        ),
        
        // Remove user from job likes
        Job.updateMany(
          { likes: userId },
          { $pull: { likes: userId } }
        ),
        
        // Remove user from blog likes
        Blog.updateMany(
          { likes: userId },
          { $pull: { likes: userId } }
        ),
        
        // Remove user from share music creation likes
        ShareMusicCreation.updateMany(
          { likes: userId },
          { $pull: { likes: userId } }
        ),
        
        // Update orders to remove user references from comments
        Order.updateMany(
          { 'comments.userId': userId },
          { $pull: { comments: { userId: userId } } }
        ),
        
        // Update orders to remove user references from reviews
        Order.updateMany(
          { 'reviews.userId': userId },
          { $pull: { reviews: { userId: userId } } }
        ),
        
        // Update gigs to remove user references from reviews
        Gig.updateMany(
          { 'reviews.userId': userId },
          { $pull: { reviews: { userId: userId } } }
        )
      ]);

      
    } catch (error) {
      console.error(`Error deleting data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get statistics about cancelled accounts
   */
  static async getCancellationStats() {
    try {
      const stats = await User.aggregate([
        {
          $match: {
            accountStatus: { $in: ['cancelled', 'deleted'] }
          }
        },
        {
          $group: {
            _id: '$accountStatus',
            count: { $sum: 1 },
            avgDaysUntilDeletion: {
              $avg: {
                $divide: [
                  { $subtract: ['$accountDeletionScheduledFor', '$accountCancelledAt'] },
                  1000 * 60 * 60 * 24 // Convert to days
                ]
              }
            }
          }
        }
      ]);

      return {
        success: true,
        stats
      };

    } catch (error) {
      console.error('Error getting cancellation stats:', error);
      throw error;
    }
  }

  /**
   * Manually delete a user account immediately (for testing)
   * @param {string} userId - The user ID to delete
   */
  static async forceDeleteUser(userId) {
    try {
      
      // Delete all user data
      await this.deleteUserData(userId);
      
      // Delete the user record
      await User.findByIdAndDelete(userId);
      
      
      return {
        success: true,
        message: 'User force deleted successfully'
      };

    } catch (error) {
      console.error(`Error force deleting user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Restore a cancelled account (admin only)
   * @param {string} userId - The user ID to restore
   */
  static async restoreAccount(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (user.accountStatus !== 'cancelled') {
        throw new Error('Account is not cancelled');
      }

      // Restore account
      await User.findByIdAndUpdate(userId, {
        accountStatus: 'active',
        isActive: true,
        $unset: {
          accountCancelledAt: 1,
          accountDeletionScheduledFor: 1
        }
      });

      
      return {
        success: true,
        message: 'Account restored successfully'
      };

    } catch (error) {
      console.error(`Error restoring account for user ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = AccountCleanupService;
