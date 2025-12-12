const express = require('express');
const auth = require('../../middlewares/auth');
const { optionalAuth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const musicValidation = require('../../validations/music.validation');
const musicController = require('../../controllers/music.controller');
const recommendationController = require('../../controllers/recommendation.controller');
const { upload } = require('../../utils/s3Upload');
const router = express.Router();

// Upload music files to S3
router.route('/upload').post(
    auth(),
    musicController.uploadMusic
);

// Upload lyrics with image
router.route('/lyrics').post(
    auth(),
    upload.fields([{ name: 'musicImage', maxCount: 1 }]),
    musicController.uploadLyrics
);

// Music data routes
router.route('/small-box').get(auth(), validate(musicValidation.getMusicBox), musicController.getMusicBox);
router.route('/get-music').get(auth() , musicController.getMyMusic);
router.route('/get-all-music').get(optionalAuth(), musicController.getAllMusic);
router.route('/get-all-music-following').get(auth(), musicController.getAllMusicFollowing);
router.route('/get-music/:id').get(optionalAuth(), validate(musicValidation.getMusicById), musicController.getMusicById);
router.route('/pop-up-page/:musicId').get(auth(), musicController.getPopUpPage);
router.route('/delete-music/:musicId').delete(auth(), musicController.deleteMusic);
router.route('/get-music-user/:userId').get(musicController.getMusicUser); // tanpa auth

// Update music on S3
router.route('/update-music/:musicId').put(
    auth(),
    upload.fields([
        { name: 'musicImage', maxCount: 1 },
        { name: 'musicAudio', maxCount: 1 },
        { name: 'musicBackground', maxCount: 1 },
    ]),
    musicController.updateMusic
);

// Like, Comment, Recommendation, Rating
router.route('/like/:musicId').post(auth(), musicController.likeMusicOrLyrics);
router.route('/view/:musicId').post(optionalAuth(), musicController.incrementView);
router.route('/comment/:musicId').post(auth(), validate(musicValidation.commentMusic), musicController.commentOnMusic);
router.route('/foryou').get(auth(), recommendationController.getRecommendations);
router.route('/rating/:musicId').post(auth(), musicController.addRating);
router.route('/liked-songs').get(auth(), musicController.getLikedSongs);
router.route('/collect/:musicId').post(auth(), musicController.collectMusic);
router.route('/my-collections').get(auth(), musicController.getMyCollections);
router.route('/following/:userId').post(auth(), musicController.followUser);
router.route('/following-list').get(auth(), musicController.getFollowingList);
router.route('/my-following').get(auth(), musicController.getMyFollowing);
// Report music or lyrics (auto detect by id)
router.route('/report/:id').post(auth(), musicController.reportContent);
// Search all assets (music, lyrics, shareassets, job)
router.route('/search/all').get(optionalAuth(), musicController.searchAllAssets);

// Get all contributions for a specific song
router.route('/contributions/:songName').get(optionalAuth(), musicController.getContributionsForSong);

// Add contributor to existing music
router.route('/contribute/:musicId').post(auth(), musicController.addContributor);

module.exports = router;

