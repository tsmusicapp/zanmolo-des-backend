const mongoose = require('mongoose');

const TrackFilesSchema = mongoose.Schema({
  length: {
    type: Number,
  },
  chunkSize: {
    type: Number,
  },
  uploadDate: {
    type: Date,
  },
  filename: {
    type: String,
  },
  md5: {
    type: String,
  },
});

/**
 * @typedef TrackFiles
 */
const TrackFiles = mongoose.model('Tracks.files', TrackFilesSchema);

module.exports = TrackFiles;
