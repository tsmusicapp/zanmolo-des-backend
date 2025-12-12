const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const musicValidation = require('../../validations/music.validation');
const commentsController = require('../../controllers/comments.controller');
const router = express.Router();

router.route('/:musicId').post(auth(), validate(musicValidation.commentMusic), commentsController.postComments);
router.route('/:musicId/comment/:commentId/like').post(auth(), commentsController.likeComment);
router.route('/:musicId/comment/:commentId/reply').post(auth(), commentsController.replyComment);
router.route('/:musicId/comment/:commentId').delete(auth(), commentsController.deleteComment);

module.exports = router;

