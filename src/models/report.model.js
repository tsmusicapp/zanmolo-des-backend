const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  type: { type: String, enum: ['user', 'music', 'lyrics', 'assets', 'job', 'blog'], required: true },
  reportedId: { type: mongoose.Schema.Types.ObjectId, required: true }, // ID of the reported item (user, music, lyrics, etc.)
  reportedUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  reason: { type: String, default: '' },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);
