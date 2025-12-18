const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

// DELETE /music-creation/:musicId
const deleteMusicOrLyric = catchAsync(async (req, res) => {
  const id = req.params.musicId || req.params.id;
  const userId = req.user?.id;
  const { Music, LyricsMusic, ShareMusicCreation, ShareMusicAsset } = require('../models');

  // Helper check owner (createdBy can be string or ObjectId)
  const isOwner = (doc) => {
    if (!userId) return false;
    const createdBy = doc.createdBy?.toString?.() || doc.createdBy;
    return createdBy && createdBy.toString() === userId.toString();
  };

  // Try delete in order: ShareMusicCreation, ShareMusicAsset, Music, LyricsMusic
  let doc = await ShareMusicCreation.findById(id);
  if (doc) {
    if (!isOwner(doc)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to delete this work');
    }
    await doc.deleteOne();
    return res.status(httpStatus.OK).json({ message: 'Work deleted successfully', type: 'creation' });
  }

  doc = await ShareMusicAsset.findById(id);
  if (doc) {
    if (!isOwner(doc)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to delete this work');
    }
    await doc.deleteOne();
    return res.status(httpStatus.OK).json({ message: 'Work deleted successfully', type: 'asset' });
  }

  doc = await Music.findById(id);
  if (doc) {
    if (!isOwner(doc)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to delete this music');
    }
    await doc.deleteOne();
    return res.status(httpStatus.OK).json({ message: 'Music creation deleted successfully', type: 'music' });
  }

  doc = await LyricsMusic.findById(id);
  if (doc) {
    if (!isOwner(doc)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to delete this lyric');
    }
    await doc.deleteOne();
    return res.status(httpStatus.OK).json({ message: 'Lyric deleted successfully', type: 'lyric' });
  }

  throw new ApiError(httpStatus.NOT_FOUND, 'Work not found');
});

// PUT /music-creation/update/:musicId untuk update data
const updateMusicCreation = catchAsync(async (req, res) => {
  const { musicId } = req.params;
  const updateData = req.body;
  const { Music, ShareMusicCreation } = require('../models');
  
  // Try ShareMusicCreation first (design/music works)
  let doc = await ShareMusicCreation.findById(musicId);
  if (doc) {
    Object.assign(doc, updateData);
    await doc.save();
    return res.status(httpStatus.OK).json({ message: 'Work updated successfully', data: doc, type: 'creation' });
  }
  
  // Fallback to Music collection
  const music = await Music.findById(musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Music creation not found');
  }
  Object.assign(music, updateData);
  await music.save();
  res.status(httpStatus.OK).json({ message: 'Music creation updated successfully', data: music, type: 'music' });
});
// PUT /music-creation/:lyricId untuk update data
const updateLyricCreation = catchAsync(async (req, res) => {
  const { musicId } = req.params;
  const updateData = req.body;
  console.log(musicId);
  console.log(updateData);
  const { LyricsMusic } = require('../models');
  const lyric = await LyricsMusic.findById(musicId);
  if (!lyric) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lyric creation not found');
  }
  Object.assign(lyric, updateData);
  await lyric.save();
  res.status(httpStatus.OK).json({ message: 'Lyric creation updated successfully', data: lyric });
});

// PUT /music-creation/assets/:assetId untuk update data
const updateAssetsCreation = catchAsync(async (req, res) => {
  const { assetId } = req.params;
  const updateData = req.body;
  const { ShareMusicAsset } = require('../models');
  const asset = await ShareMusicAsset.findById(assetId);
  if (!asset) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Assets creation not found');
  }
  Object.assign(asset, updateData);
  await asset.save();
  res.status(httpStatus.OK).json({ message: 'Assets creation updated successfully', data: asset });
});

module.exports = {
  deleteMusicOrLyric,
  updateMusicCreation,
  updateLyricCreation,
  updateAssetsCreation
};
