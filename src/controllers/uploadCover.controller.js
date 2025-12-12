const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { uploadFileToS3 } = require('../utils/s3Upload');
const { userSpaceService } = require('../services');

const uploadCover = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: 'No file uploaded' });
  }
  const userId = req.user.id;
  req.file.fieldname = 'userSpaceCover';
  const s3Result = await uploadFileToS3(req.file, userId);
  // Update userSpace with full S3 url
  await userSpaceService.updateSpace(userId, { coverUrl: s3Result.url });
  res.status(httpStatus.OK).json({ coverUrl: s3Result.url });
});

module.exports = uploadCover;
