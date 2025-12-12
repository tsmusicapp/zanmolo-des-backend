const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { blogService, userSpaceService, userService } = require('../services');
const { uploadFileToS3 } = require('../utils/s3Upload');
const slugify = require('../utils/slugify');
const { createBlogReport } = require('./report.controller');

const createBlog = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const files = req.files;

  // Check if required files are uploaded
  if (!files || !files.coverImage) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cover image is required');
  }

  // Get user space to retrieve firstName and lastName
  const userSpace = await userSpaceService.getSpace(userId);
  if (!userSpace) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User space not found. Please complete your profile first.');
  }

  // Create userName from userSpace firstName and lastName
  const userName = `${userSpace.firstName} ${userSpace.lastName}`.trim();

  // Parse classification if it's a string (from multipart form data)
  let classification = req.body.classification;
  if (classification && typeof classification === 'string') {
    try {
      classification = JSON.parse(classification);
    } catch (error) {
      // If parsing fails, split by comma or treat as single value
      if (classification.includes(',')) {
        classification = classification.split(',').map(item => item.trim());
      } else {
        classification = [classification];
      }
    }
  }

  const uploaded = {};

  // Upload cover image to S3
  if (files.coverImage && files.coverImage[0]) {
    const coverFile = files.coverImage[0];
    const s3Response = await uploadFileToS3(coverFile, userId);
    uploaded.coverUrl = s3Response.url;
  }

  // Generate slug dari title
  const slug = slugify(req.body.title);
  // Prepare payload untuk DB
  const payload = {
    ...req.body,
    classification,
    ...uploaded,
    createdBy: userId,
    userName: userName,
    slug,
  };

  const blog = await blogService.createBlog(payload);
  res.status(httpStatus.CREATED).send(blog);
});

const getBlogs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['title', 'classification', 'userName']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  // Add default sorting by creation date (newest first)
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  // Only show active blogs
  filter.isActive = true;

  // Add populate options (plugin expects string format)
  options.populate = 'createdBy,comments.user';

  const result = await blogService.queryBlogsWithEnhancedComments(filter, options);
  
  // Add isLiked field for authenticated users
  if (req.user) {
    result.results = result.results.map(blog => {
      // blog is already an object from queryBlogsWithEnhancedComments
      blog.isLiked = blog.likes.some(like => like.toString() === req.user.id);
      return blog;
    });
  }

  res.send(result);
});

// Deklarasi setelah catchAsync agar tidak ReferenceError
const getBlogSlug = catchAsync(async (req, res) => {
  const blog = await blogService.getBlogBySlug(req.params.slug, req.user?.id);
  res.send(blog);
});

const getBlog = catchAsync(async (req, res) => {
  let blog;
  // Cek apakah param adalah slug atau id
  if (req.params.blogId && /^[a-fA-F0-9]{24}$/.test(req.params.blogId)) {
    // Mongo ObjectId
    blog = await blogService.getBlogById(req.params.blogId, req.user?.id);
  } else {
    // Asumsikan slug
    blog = await blogService.getBlogBySlug(req.params.blogId, req.user?.id);
  }
  
  // Increment view count if user is authenticated and hasn't viewed before
  if (req.user) {
    const viewResult = await blogService.incrementViewCount(req.params.blogId, req.user.id);
    // Add view information to response
    blog.viewInfo = {
      hasViewedBefore: viewResult.hasViewed,
      currentViewCount: viewResult.newViewCount
    };

    // Check if current user is following the blog creator
    const currentUser = await userService.getUserById(req.user.id);
    blog.isFollowing = currentUser.following.some(followedUserId => 
      followedUserId.toString() === blog.createdBy._id.toString()
    );
  } else {
    blog.isFollowing = false;
  }
  
  res.send(blog);
});

const updateBlog = catchAsync(async (req, res) => {
  const files = req.files;
  const updateData = { ...req.body };

  // Parse classification if it's a string (from multipart form data)
  if (updateData.classification && typeof updateData.classification === 'string') {
    try {
      updateData.classification = JSON.parse(updateData.classification);
    } catch (error) {
      // If parsing fails, split by comma or treat as single value
      if (updateData.classification.includes(',')) {
        updateData.classification = updateData.classification.split(',').map(item => item.trim());
      } else {
        updateData.classification = [updateData.classification];
      }
    }
  }

  // Upload new files if provided
  if (files) {
    // Upload cover image to S3
    if (files.coverImage && files.coverImage[0]) {
      const coverFile = files.coverImage[0];
      const s3Response = await uploadFileToS3(coverFile, req.user.id);
      updateData.coverUrl = s3Response.url;
    }
  }

  const blog = await blogService.updateBlogById(req.params.blogId, updateData, req.user.id);
  res.send(blog);
});

const deleteBlog = catchAsync(async (req, res) => {
  await blogService.deleteBlogById(req.params.blogId, req.user.id);
  res.status(httpStatus.NO_CONTENT).send();
});

const likeBlog = catchAsync(async (req, res) => {
  const result = await blogService.toggleLikeBlog(req.params.blogId, req.user.id);
  res.send(result);
});

const commentOnBlog = catchAsync(async (req, res) => {
  const blog = await blogService.addCommentToBlog(req.params.blogId, req.user.id, req.body.comment);
  res.send(blog);
});

const deleteComment = catchAsync(async (req, res) => {
  const blog = await blogService.deleteCommentFromBlog(req.params.blogId, req.params.commentId, req.user.id);
  res.send(blog);
});

const getBlogsByUser = catchAsync(async (req, res) => {
  const filter = {};
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  // Add default sorting
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  const result = await blogService.getBlogsByUserId(req.params.userId, filter, options);
  
  // Add isLiked field for authenticated users
  if (req.user) {
    result.results = result.results.map(blog => {
      // blog is already an object from getBlogsByUserId enhanced function
      blog.isLiked = blog.likes.some(like => like.toString() === req.user.id);
      return blog;
    });
  }

  res.send(result);
});

const getMyBlogs = catchAsync(async (req, res) => {
  const filter = {};
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  // Add default sorting
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  const result = await blogService.getBlogsByUserId(req.user.id, filter, options);
  res.send(result);
});


const getTrendingBlogs = catchAsync(async (req, res) => {
  const filter = { isActive: true };
  const options = {
    sortBy: 'likesCount:desc,createdAt:desc',
    limit: parseInt(req.query.limit) || 20,
    page: parseInt(req.query.page) || 1,
    populate: 'createdBy,comments.user'
  };

  const result = await blogService.queryBlogsWithEnhancedComments(filter, options);
  
  // Add isLiked field for authenticated users
  if (req.user) {
    result.results = result.results.map(blog => {
      // blog is already an object from queryBlogsWithEnhancedComments
      blog.isLiked = blog.likes.some(like => like.toString() === req.user.id);
      return blog;
    });
  }

  res.send(result);
});

const getBlogsByClassification = catchAsync(async (req, res) => {
  const filter = { 
    classification: req.params.classification,
    isActive: true 
  };
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  // Add default sorting
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  // Add populate options (plugin expects string format)
  options.populate = 'createdBy,comments.user';

  const result = await blogService.queryBlogsWithEnhancedComments(filter, options);
  
  // Add isLiked field for authenticated users
  if (req.user) {
    result.results = result.results.map(blog => {
      // blog is already an object from queryBlogsWithEnhancedComments
      blog.isLiked = blog.likes.some(like => like.toString() === req.user.id);
      return blog;
    });
  }

  res.send(result);
});

module.exports = {
  createBlog,
  getBlogs,
  getBlog,
  getBlogSlug,
  updateBlog,
  deleteBlog,
  likeBlog,
  commentOnBlog,
  deleteComment,
  getBlogsByUser,
  getMyBlogs,
  getTrendingBlogs,
  getBlogsByClassification,
  reportBlog: createBlogReport,
};
