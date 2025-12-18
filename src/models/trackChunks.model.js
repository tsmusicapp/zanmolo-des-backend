const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectID = Schema.ObjectId;

const trackChunksSchema = mongoose.Schema({
  files_id: {
    type: ObjectID,
  },
  n: {
    type: Number,
  },
});

/**
 * @typedef TrackChunks
 */
const TrackChunks = mongoose.model('Tracks.chunks', trackChunksSchema);

module.exports = TrackChunks;
