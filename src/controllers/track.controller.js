const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const multer = require('multer');
const mongodb = require('mongodb');
const { ObjectId } = require('mongodb');
const { Readable } = require('stream');
const { trackService } = require('../services');
const { User } = require('../models');
const { uploadFileToS3 } = require('../utils/s3Upload');

// const uploadTracks = catchAsync(async (req, res) => {

//    if (!req.file) {
//      return res.status(400).send({ message: 'Please upload a file!' });
//    }

//    const filePath = req.file.path;

//    const user = await User.findById(req.user.id); 
//    if (!user) {
//      return res.status(404).send({ message: 'User not found!' });
//    }

//    user.music = filePath;
//    await user.save();

//    res.status(httpStatus.OK).send({
//      message: 'Profile picture uploaded successfully',
//      data: {
//        music: filePath, // Path of the uploaded image
//        userId: user._id,
//      },
//    });
// });

const uploadTracks = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: 'Please upload a file!' });
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).send({ message: 'User not found!' });
  }

  // Upload to S3
  const s3Result = await uploadFileToS3(req.file, user._id.toString());

  // Save the S3 file URL to user's "music" field
  user.music = s3Result.url;
  await user.save();

  res.status(httpStatus.OK).send({
    message: 'Music uploaded successfully',
    data: {
      music: s3Result.url,
      userId: user._id,
    },
  });
});

const playTracks = catchAsync(async (req, res) => {
  try {
    var trackID = new ObjectId(req.params.trackID);
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: 'Invalid trackID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters',
    });
  }
  res.set('content-type', 'audio/mp3');
  res.set('accept-ranges', 'bytes');

  let bucket = new mongodb.GridFSBucket(__databaseMongo, {
    bucketName: 'tracks',
  });

  let downloadStream = bucket.openDownloadStream(trackID);

  downloadStream.on('data', (chunk) => {
    res.write(chunk);
  });

  downloadStream.on('error', () => {
    res.sendStatus(404);
  });

  downloadStream.on('end', () => {
    res.end();
  });
});

const deleteTracksById = catchAsync(async (req, res) => {
  await trackService.deleteTracksById(req.params.trackID);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  uploadTracks,
  playTracks,
  deleteTracksById,
};
