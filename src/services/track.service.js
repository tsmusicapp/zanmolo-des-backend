const httpStatus = require('http-status');
const { TrackFiles, TrackChunks } = require('../models');
const ApiError = require('../utils/ApiError');
const { ObjectId } = require('mongodb');

/**
 * Get TrackFiles by id
 * @param {ObjectId} id
 * @returns {Promise<TrackFiles>}
 */
const getTrackById = async (id) => {
  return TrackFiles.findById(id);
};

/**
 * Get TrackFiles by id
 * @param {ObjectId} id
 * @returns {Promise<TrackFiles>}
 */
const getChunks = async (query) => {
  return TrackChunks.find(query);
};

/**
 * Delete Tracks and Chunks by trackID
 * @param {ObjectId} trackID
 * @returns {Promise<User>}
 */
const deleteTracksById = async (trackID) => {
  const tracks = await getTrackById(trackID);
  if (!tracks) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tracks not found');
  }
  const query = { files_id: ObjectId(trackID) };
  const chunks = await getChunks(query);
  if (chunks.length < 1) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Chunks not found');
  }
  await TrackChunks.deleteMany(query);
  await tracks.remove();
  return tracks;
};

module.exports = {
  getTrackById,
  deleteTracksById,
  getChunks,
};
