const express = require('express');
const auth = require('../../middlewares/auth');
const trackController = require('../../controllers/track.controller');
const { uploadMusic } = require('../../middlewares/uploadMusic');
const { uploadDynamic } = require('../../middlewares/upload');

const router = express.Router();

router.route('/').post(auth('user'), uploadDynamic.single('music'),trackController.uploadTracks);
router.route('/:trackID').get(auth('user'), trackController.playTracks);
router.route('/:trackID').delete(auth('user'), trackController.deleteTracksById);

module.exports = router;
