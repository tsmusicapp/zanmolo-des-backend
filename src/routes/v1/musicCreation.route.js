const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const shareMusicValidation = require('../../validations/shareMusic.validation');
const shareMusicController = require('../../controllers/shareMusic.controller');
const musicCreationController = require('../../controllers/musicCreation.controller');

const router = express.Router();

router.route('/').post(auth(), validate(shareMusicValidation.shareCreation), shareMusicController.shareCreation);
router.route('/all').get(auth.optionalAuth(), shareMusicController.getAllCreations);
router.route('/:id').get(auth(), validate(shareMusicValidation.getCreation), shareMusicController.getCreationbyId);
router.route('/').get(auth(), validate(shareMusicValidation.getCreation), shareMusicController.getCreation);
router.route('/:musicId').delete(auth(), require('../../controllers/musicCreation.controller').deleteMusicOrLyric);
router.route('/update/:musicId').put(auth(), require('../../controllers/musicCreation.controller').updateMusicCreation);
router.route('/update/lyric/:musicId').put(auth(), require('../../controllers/musicCreation.controller').updateLyricCreation);
router.route('/update/assets/:musicId').put(auth(), require('../../controllers/musicCreation.controller').updateAssetsCreation);
router.route('/:id/comment').post(auth(), shareMusicController.commentOnCreation);
router.route('/:id/collect').post(auth(), shareMusicController.collectCreation);

// router
//   .route('/:userId')
//   .get(auth('admin'), validate(userValidation.getUser), userController.getUser)
//   .patch(auth('admin'), validate(userValidation.updateUser), userController.updateUser)
//   .delete(auth('admin'), validate(userValidation.deleteUser), userController.deleteUser);

module.exports = router;
