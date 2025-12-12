const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const userSpaceValidation = require('../../validations/userSpace.validation');
const userSpaceController = require('../../controllers/userSpace.controller');
const uploadCoverValidation = require('../../validations/uploadCover.validation');
const { upload, uploadFileToS3 } = require('../../utils/s3Upload');

const router = express.Router();

router.route('/').get(auth(), validate(userSpaceValidation.getSpace), userSpaceController.getSpace);
router.route('/add').post(auth('user'), validate(userSpaceValidation.addSpace), userSpaceController.addSpace);
// router.route('/edit').get(auth('users'), validate(userSpaceValidation.editSpace), userSpaceController.uploadMusic);
router.route('/update').patch(auth('user'), validate(userSpaceValidation.updateSpace), userSpaceController.updateSpace);
router.route('/upload-cover').post(
  auth('user'),
  validate(uploadCoverValidation.uploadCover),
  async (req, res, next) => {
    try {
      const { profileBgUrl, profileBgPosY, filename } = req.body;
      if (!profileBgUrl) {
        return res.status(400).json({ message: 'profileBgUrl (dataurl) is required' });
      }
      // Extract base64 and mimetype from dataurl
      const matches = profileBgUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ message: 'Invalid dataurl format' });
      }
      const mimetype = matches[1];
      const base64 = matches[2];
      const userId = req.user.id;
      const buffer = Buffer.from(base64, 'base64');
      // Generate filename if not provided
      const ext = mimetype.split('/')[1] || 'jpg';
      const safeFilename = filename || `cover_${Date.now()}.${ext}`;
      const file = {
        buffer,
        originalname: safeFilename,
        mimetype,
        fieldname: 'userSpaceCover',
      };
      const s3Result = await uploadFileToS3(file, userId);
      // Update DB userSpace
      await require('../../services/userSpace.service').updateSpace(userId, { coverUrl: s3Result.url, coverCrop: profileBgPosY });
      return res.status(200).json({ coverUrl: s3Result.url });
    } catch (err) {
      next(err);
    }
  }
);
router.route('/unread-chats').get(auth(), userSpaceController.getUnreadChats);
// router
//   .route('/:userId')
//   .get(auth('getUsers'), validate(userValidation.getUser), userController.getUser)
//   .patch(auth('admin'), validate(userValidation.updateUser), userController.updateUser)
//   .delete(auth('admin'), validate(userValidation.deleteUser), userController.deleteUser);

module.exports = router;
