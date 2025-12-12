const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { ShareMusicAsset, Music, LyricsMusic } = require('../models');
const mongoose = require('mongoose');
const { userSpaceService } = require('../services');

const postComments = catchAsync(async (req, res) => {
  const { musicId } = req.params;
  const { comment } = req.body;
  const { type } = req.query;
  const userId = req.user.id;
  const userSpace = await userSpaceService.getSpace(req.user.id);
  const userName = `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim();
  const profilePicture = req.user.profilePicture;

  const newComment = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    comment,
    userName,
    profilePicture,
    createdAt: new Date(),
    likes: [],
    reply: [],
  };

  let updatedModel = null;

  if (type === 'home') {
    // Try Music model first
    const music = await Music.findById(musicId);
    if (music) {
      await Music.findByIdAndUpdate(musicId, {
        $push: { comments: newComment },
      });
      updatedModel = 'Music';
    } else {
      // Try LyricsMusic
      const lyrics = await LyricsMusic.findById(musicId);
      if (lyrics) {
        await LyricsMusic.findByIdAndUpdate(musicId, {
          $push: { comments: newComment },
        });
        updatedModel = 'LyricsMusic';
      }
    }
  } else if (type === 'assets') {
    const asset = await ShareMusicAsset.findById(musicId);
    if (asset) {
      await ShareMusicAsset.findByIdAndUpdate(musicId, {
        $push: { comments: newComment },
      });
      updatedModel = 'ShareMusicAsset';
    }
  }

  if (!updatedModel) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Music item not found in any model' });
  }

  res.status(httpStatus.CREATED).send({
    message: `Comment added successfully to ${updatedModel}`,
    comment: newComment,
  });
});

const likeComment = catchAsync(async (req, res) => {
  const { musicId, commentId } = req.params;
  const userId = req.user.id;
  let data = await Music.findById(musicId);
  let modelType = 'Music';
  if (!data) {
    data = await LyricsMusic.findById(musicId);
    modelType = 'LyricsMusic';
  }
  if (!data) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Music or lyrics not found' });
  }
  const commentIndex = data.comments.findIndex(comment => comment._id.toString() === commentId);
  if (commentIndex === -1) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Comment not found' });
  }
  if (!Array.isArray(data.comments[commentIndex].likes)) data.comments[commentIndex].likes = [];
  const isLiked = data.comments[commentIndex].likes.includes(userId);
  if (!isLiked) {
    data.comments[commentIndex].likes.push(userId);
  } else {
    data.comments[commentIndex].likes = data.comments[commentIndex].likes.filter(id => id.toString() !== userId.toString());
  }
  await data.save();
  res.status(httpStatus.OK).send({
    message: isLiked ? 'Comment unliked successfully' : 'Comment liked successfully',
    comment: data.comments[commentIndex],
    modelType,
  });
});

const replyComment = catchAsync(async (req, res) => {
  const { musicId, commentId } = req.params;
  const { reply } = req.body;
  const userId = req.user.id;
  const userName = req.user.name;
  const replyObj = {
    userId,
    reply,
    userName,
    createdAt: new Date(),
  };
  // Reply pada Music
  let updated = await Music.updateOne(
    { _id: musicId, 'comments._id': commentId },
    { $push: { 'comments.$.reply': replyObj } }
  );
  // Reply pada LyricsMusic
  if (!updated.modifiedCount) {
    updated = await LyricsMusic.updateOne(
      { _id: musicId, 'comments._id': commentId },
      { $push: { 'comments.$.reply': replyObj } }
    );
  }
  // Reply pada ShareMusicAsset
  if (!updated.modifiedCount) {
    updated = await ShareMusicAsset.updateOne(
      { _id: musicId, 'comments._id': commentId },
      { $push: { 'comments.$.reply': replyObj } }
    );
  }
  if (!updated.modifiedCount) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Comment not found' });
  }
  res.status(httpStatus.OK).send({ message: 'Reply added successfully', reply: replyObj });
});

const deleteComment = catchAsync(async (req, res) => {
  const { musicId, commentId } = req.params;
  const userId = req.user.id;

  // Cek di Music
  let data = await Music.findById(musicId);
  let modelType = 'Music';
  if (!data) {
    data = await LyricsMusic.findById(musicId);
    modelType = 'LyricsMusic';
  }
  if (!data) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Music or lyrics not found' });
  }
  // Pastikan comment milik user sendiri
  const comment = data.comments.find(c => c._id.toString() === commentId);
  if (!comment) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Comment not found' });
  }
  if (comment.userId.toString() !== userId.toString()) {
    return res.status(httpStatus.FORBIDDEN).send({ message: 'You can only delete your own comment' });
  }
  // Hapus comment
  data.comments = data.comments.filter(c => c._id.toString() !== commentId);
  data.markModified('comments');
  await data.save();
  res.status(httpStatus.OK).send({ message: 'Comment deleted successfully', modelType });
});

module.exports = {
  postComments,
  likeComment,
  replyComment,
  deleteComment,
};
