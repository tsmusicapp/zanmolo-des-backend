const express = require('express');
const auth = require('../../middlewares/auth');
const { optionalAuth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const blogValidation = require('../../validations/blog.validation');
const blogController = require('../../controllers/blog.controller');
const { upload } = require('../../utils/s3Upload');

const router = express.Router();

router.route('/')
    .post(auth(), upload.fields([{ name: 'coverImage', maxCount: 1 }]), validate(blogValidation.createBlog), blogController.createBlog)
    .get(optionalAuth(), validate(blogValidation.getBlogs), blogController.getBlogs);

router.route('/my-blogs')
    .get(auth(), blogController.getMyBlogs);

router.route('/trending')
    .get(optionalAuth(), blogController.getTrendingBlogs);

router.route('/classification/:classification')
    .get(optionalAuth(), blogController.getBlogsByClassification);

router.route('/user/:userId')
    .get(optionalAuth(), validate(blogValidation.getBlogsByUser), blogController.getBlogsByUser);

router.route('/:blogId')
    .get(optionalAuth(), validate(blogValidation.getBlog), blogController.getBlog)
    .put(auth(), upload.fields([{ name: 'coverImage', maxCount: 1 }]), validate(blogValidation.updateBlog), blogController.updateBlog)
    .delete(auth(), validate(blogValidation.deleteBlog), blogController.deleteBlog);

router.route('/slug/:slug')
    .get(optionalAuth(), validate(blogValidation.getBlogSlug), blogController.getBlogSlug);

router.route('/:blogId/like')
    .post(auth(), validate(blogValidation.likeBlog), blogController.likeBlog);

router.route('/:blogId/comment')
    .post(auth(), validate(blogValidation.commentBlog), blogController.commentOnBlog);

router.route('/:blogId/comment/:commentId')
    .delete(auth(), validate(blogValidation.deleteComment), blogController.deleteComment);


// Endpoint untuk melaporkan blog
router.route('/:blogId/report')
    .post(auth(), validate(blogValidation.reportBlog), blogController.reportBlog);

module.exports = router;
