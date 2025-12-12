const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: String,
  attachment: String,
  createdAt: { type: Date, default: Date.now },
});

const ChatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  inquiry: { type: Boolean, default: false }, // Label for inquiries
  isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array: hanya id user yang sudah baca
  messages: [
    {
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      text: { type: String, required: false }, // Make text optional when attachments exist
      isCard: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
      readby: { type: Boolean, default: false },
      cardData: {
        type: mongoose.Schema.Types.Mixed, // Use Mixed type for flexible card data
        default: null,
      },
      attachments: [{
        filename: { type: String },
        originalName: { type: String },
        url: { type: String },
        size: { type: Number },
        mimetype: { type: String },
        uploadedAt: { type: Date, default: Date.now },
        expiresAt: { 
          type: Date, 
          default: function() {
            // Set expiration to 2 months from upload date
            const twoMonthsFromNow = new Date();
            twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
            return twoMonthsFromNow;
          }
        }
      }],
    },
  ],
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
});

// Ensure uniqueness of participants set (ignoring order)
// ChatSchema.index({ participants: 1 }, { unique: true });

const Chat = mongoose.model('Chat', ChatSchema);

module.exports = Chat;
