// const httpStatus = require('http-status');
// const catchAsync = require('../utils/catchAsync');
// const User = require('../models/user.model'); // Import the User model

// /**
//  * Handle the upload of a profile picture and save the image path to the user's profile.
//  * @param {Object} req - The request object.
//  * @param {Object} res - The response object.
//  * @param {Object} next - The next middleware function.
//  */
// const uploadImage = catchAsync(async (req, res) => {
  
//   if (!req.file) {
//     return res.status(400).send({ message: 'Please upload a file!' });
//   }

//   const filePath = req.file.path;

//   const user = await User.findById(req.user.id); 
//   if (!user) {
//     return res.status(404).send({ message: 'User not found!' });
//   }

//   user.profilePicture = filePath;
//   await user.save();

//   res.status(httpStatus.OK).send({
//     message: 'Profile picture uploaded successfully',
//     data: {
//       profilePicture: filePath, // Path of the uploaded image
//       userId: user._id,
//     },
//   });
// });

// module.exports = {
//   uploadImage,
// };

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/user.model');
const { uploadFileToS3 } = require('../utils/s3Upload');


const uploadImage = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: 'Please upload a file!' });
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).send({ message: 'User not found!' });
  }

  // Upload to S3
  const s3Result = await uploadFileToS3(req.file, user._id.toString());

  // Determine response based on file type
  let responseData = {};
  let message = 'File uploaded successfully';

  switch (req.file.fieldname) {
    case 'profilePicture':
      user.profilePicture = s3Result.url;
      await user.save();
      responseData = { profilePicture: s3Result.url, userId: user._id };
      message = 'Profile picture uploaded successfully';
      break;
    case 'musicImage':
      responseData = { musicImage: s3Result.url };
      message = 'Music image uploaded successfully';
      break;
    case 'musicBackground':
      responseData = { musicBackground: s3Result.url };
      message = 'Music background uploaded successfully';
      break;
    case 'workImage':
      responseData = { workImage: s3Result.url };
      message = 'Work image uploaded successfully';
      break;
    case 'assetImage':
      responseData = { imageUrl: s3Result.url };
      message = 'Asset image uploaded successfully';
      break;
    case 'asset':
      responseData = { assetUrl: s3Result.url };
      message = 'Asset file uploaded successfully';
      break;
    default:
      responseData = { fileUrl: s3Result.url };
      message = 'File uploaded successfully';
  }

  res.status(httpStatus.OK).send({
    message,
    data: responseData,
  });
});

module.exports = {
  uploadImage,
};
