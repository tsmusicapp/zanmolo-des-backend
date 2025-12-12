const mongoose = require('mongoose');

const dailyLimitsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Make optional for anonymous users
    index: true
  },
  email: {
    type: String,
    required: false, // For anonymous users
    index: true
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true,
    index: true
  },
  chatCreations: {
    type: Number,
    default: 0,
    max: 20
  },
  reports: {
    type: Number,
    default: 0,
    max: 5
  },
  contactUsMessages: {
    type: Number,
    default: 0,
    max: 5
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user per day
dailyLimitsSchema.index({ userId: 1, date: 1 }, { unique: true, sparse: true });
// Compound index for anonymous users by email
dailyLimitsSchema.index({ email: 1, date: 1 }, { unique: true, sparse: true });

// Method to get or create daily limits for a user or email
dailyLimitsSchema.statics.getOrCreateDailyLimits = async function(identifier, date) {
  const today = date || new Date().toISOString().split('T')[0];
  
  // Determine if identifier is userId (ObjectId) or email (string)
  const isObjectId = mongoose.Types.ObjectId.isValid(identifier);
  
  let query;
  if (isObjectId) {
    query = { userId: identifier, date: today };
  } else {
    query = { email: identifier, date: today };
  }
  
  // Try to find existing record first
  let dailyLimits = await this.findOne(query);
  
  if (!dailyLimits) {
    const limitData = {
      date: today,
      chatCreations: 0,
      reports: 0,
      contactUsMessages: 0
    };
    
    if (isObjectId) {
      limitData.userId = identifier;
    } else {
      limitData.email = identifier;
    }
    
    try {
      // Try to create new record
      dailyLimits = new this(limitData);
      await dailyLimits.save();
    } catch (error) {
      // Handle duplicate key error (race condition)
      if (error.code === 11000) {
        console.log('Duplicate key error, trying to find existing record...');
        // Try to find the record that was created by another process
        dailyLimits = await this.findOne(query);
        
        if (!dailyLimits) {
          // If still not found, create a simple record without complex operations
          try {
            dailyLimits = new this(limitData);
            await dailyLimits.save();
          } catch (secondError) {
            // If still failing, just return a basic limit object
            console.log('Still failing to create record, using fallback...');
            dailyLimits = {
              contactUsMessages: 0,
              canPerformAction: () => true,
              getRemainingActions: () => 5,
              incrementAction: async () => {}
            };
          }
        }
      } else {
        throw error;
      }
    }
  }
  
  return dailyLimits;
};

// Method to check if user can perform an action
dailyLimitsSchema.methods.canPerformAction = function(action) {
  switch (action) {
    case 'chatCreation':
      return this.chatCreations < 20;
    case 'report':
      return this.reports < 5;
    case 'contactUs':
      return this.contactUsMessages < 5;
    default:
      return false;
  }
};

// Method to increment action count
dailyLimitsSchema.methods.incrementAction = function(action) {
  switch (action) {
    case 'chatCreation':
      this.chatCreations += 1;
      break;
    case 'report':
      this.reports += 1;
      break;
    case 'contactUs':
      this.contactUsMessages += 1;
      break;
  }
  this.updatedAt = new Date();
  return this.save();
};

// Method to get remaining actions
dailyLimitsSchema.methods.getRemainingActions = function(action) {
  switch (action) {
    case 'chatCreation':
      return Math.max(0, 20 - this.chatCreations);
    case 'report':
      return Math.max(0, 5 - this.reports);
    case 'contactUs':
      return Math.max(0, 5 - this.contactUsMessages);
    default:
      return 0;
  }
};

module.exports = mongoose.model('DailyLimits', dailyLimitsSchema);
