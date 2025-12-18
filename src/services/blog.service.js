/**
 * Get blog by slug
 * @param {string} slug
 * @param {string} [userId] - Optional user id to check if liked
 * @returns {Promise<Blog>}
 */
const getBlogBySlug = async (slug, userId = null) => {
  const blog = await Blog.findOne({ slug })
    .populate('createdBy', 'name email profileImage')
    .populate('comments.user', 'name email profileImage');
  if (!blog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }
  if (!blog.isActive) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }
  let blogObj = blog.toObject();
  // Add profilePicture from userSpace to createdBy
  if (blogObj.createdBy && blogObj.createdBy._id) {
    const creatorUserSpace = await UserSpace.findOne({ createdBy: blogObj.createdBy._id.toString() }).lean();
    if (creatorUserSpace) {
      blogObj.createdBy.profilePicture = creatorUserSpace.profilePicture || '';
    }
  }
  // Add profilePicture from userSpace to comments
  blogObj = await enhanceCommentsWithProfilePicture(blogObj);
  // Check if current user liked this blog
  if (userId) {
    blogObj.isLiked = blog.likes.some(like => like.toString() === userId);
  }
  return blogObj;
};
const httpStatus = require('http-status');
const { Blog, User, UserSpace } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Helper function to add profilePicture from userSpace to blog comments
 * @param {Object} blogObj - Blog object with comments
 * @returns {Promise<Object>} - Blog object with enhanced comments
 */
const enhanceCommentsWithProfilePicture = async (blogObj) => {
  if (!blogObj.comments || blogObj.comments.length === 0) {
    return blogObj;
  }

  // Get all unique user IDs from comments
  const commentUserIds = blogObj.comments.map(comment => comment.user._id);
  
  // Fetch userSpaces for all comment users
  const userSpaces = await UserSpace.find({ 
    createdBy: { $in: commentUserIds } 
  }).lean();
  
  // Create a map for quick lookup
  const userSpaceMap = {};
  userSpaces.forEach(space => {
    userSpaceMap[space.createdBy] = space;
  });
  
  // Add profilePicture to each comment user
  blogObj.comments = blogObj.comments.map(comment => {
    const userSpace = userSpaceMap[comment.user._id.toString()];
    return {
      ...comment,
      user: {
        ...comment.user,
        profilePicture: userSpace?.profilePicture || ''
      }
    };
  });

  return blogObj;
};

/**
 * Enhanced query for blogs with profilePicture in comments
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>} - Query result with enhanced comments
 */
const queryBlogsWithEnhancedComments = async (filter, options) => {
  // Pastikan hanya ambil blog dengan status 'published'
  const publishedFilter = { ...filter, status: 'published' };
  const result = await Blog.paginate(publishedFilter, options);

  if (result.results && result.results.length > 0) {
    // Get all unique user IDs from all comments in all blogs
    const allCommentUserIds = [];
    const allCreatedByIds = [];
    result.results.forEach(blog => {
      if (blog.comments && blog.comments.length > 0) {
        blog.comments.forEach(comment => {
          if (comment.user && comment.user._id) {
            allCommentUserIds.push(comment.user._id.toString());
          }
        });
      }
      if (blog.createdBy && blog.createdBy._id) {
        allCreatedByIds.push(blog.createdBy._id.toString());
      }
    });

    // Remove duplicates
    const uniqueUserIds = [...new Set(allCommentUserIds)];
    const uniqueCreatedByIds = [...new Set(allCreatedByIds)];

    // Fetch userSpaces for all comment users and createdBy
    const userSpaces = await UserSpace.find({ 
      createdBy: { $in: [...uniqueUserIds, ...uniqueCreatedByIds] } 
    }).lean();

    // Create a map for quick lookup
    const userSpaceMap = {};
    userSpaces.forEach(space => {
      userSpaceMap[space.createdBy.toString()] = space;
    });

    // Enhance all blogs with profilePicture in comments and createdBy, and remove password from createdBy
    result.results = result.results.map(blog => {
      const blogObj = blog.toObject();

      // Enhance createdBy
      if (blogObj.createdBy && blogObj.createdBy._id) {
        const creatorSpace = userSpaceMap[blogObj.createdBy._id.toString()];
        blogObj.createdBy.profilePicture = creatorSpace?.profilePicture || '';
        if (blogObj.createdBy.password) {
          delete blogObj.createdBy.password;
        }
      }

      // Enhance comments
      if (blogObj.comments && blogObj.comments.length > 0) {
        blogObj.comments = blogObj.comments.map(comment => {
          const userSpace = userSpaceMap[comment.user._id.toString()];
          return {
            ...comment,
            user: {
              ...comment.user,
              profilePicture: userSpace?.profilePicture || ''
            }
          };
        });
      }

      return blogObj;
    });
  }

  return result;
};

/**
 * Create a blog
 * @param {Object} blogBody
 * @returns {Promise<Blog>}
 */
const createBlog = async (blogBody) => {
  return Blog.create(blogBody);
};

/**
 * Query for blogs
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryBlogs = async (filter, options) => {
  const blogs = await Blog.paginate(filter, options);
  return blogs;
};

/**
 * Get blog by id
 * @param {ObjectId} id
 * @param {string} [userId] - Optional user id to check if liked
 * @returns {Promise<Blog>}
 */
const getBlogById = async (id, userId = null) => {
  const blog = await Blog.findById(id)
    .populate('createdBy', 'name email profileImage')
    .populate('comments.user', 'name email profileImage');
  
  if (!blog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }

  if (!blog.isActive) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }

  let blogObj = blog.toObject();

  // Add profilePicture from userSpace to createdBy
  if (blogObj.createdBy && blogObj.createdBy._id) {
    const creatorUserSpace = await UserSpace.findOne({ 
      createdBy: blogObj.createdBy._id.toString() 
    }).lean();
    
    if (creatorUserSpace) {
      blogObj.createdBy.profilePicture = creatorUserSpace.profilePicture || '';
    }
  }

  // Add profilePicture from userSpace to comments
  blogObj = await enhanceCommentsWithProfilePicture(blogObj);

  // Check if current user liked this blog
  if (userId) {
    blogObj.isLiked = blog.likes.some(like => like.toString() === userId);
  }

  return blogObj;
};

/**
 * Get blogs by user id
 * @param {ObjectId} userId
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getBlogsByUserId = async (userId, filter = {}, options = {}) => {
  const combinedFilter = { createdBy: userId, isActive: true, ...filter };
  
  // Set populate in string format for pagination plugin
  const paginateOptions = {
    populate: 'createdBy,comments.user',
    ...options
  };
  
  const result = await Blog.paginate(combinedFilter, paginateOptions);
  
  // Enhance comments with profilePicture from userSpace
  if (result.results && result.results.length > 0) {
    // Get all unique user IDs from all comments in all blogs
    const allCommentUserIds = [];
    result.results.forEach(blog => {
      if (blog.comments && blog.comments.length > 0) {
        blog.comments.forEach(comment => {
          if (comment.user && comment.user._id) {
            allCommentUserIds.push(comment.user._id);
          }
        });
      }
    });

    // Remove duplicates
    const uniqueUserIds = [...new Set(allCommentUserIds.map(id => id.toString()))];
    
    if (uniqueUserIds.length > 0) {
      // Fetch userSpaces for all comment users
      const userSpaces = await UserSpace.find({ 
        createdBy: { $in: uniqueUserIds } 
      }).lean();
      
      // Create a map for quick lookup
      const userSpaceMap = {};
      userSpaces.forEach(space => {
        userSpaceMap[space.createdBy] = space;
      });
      
      // Enhance all blogs with profilePicture in comments
      result.results = result.results.map(blog => {
        const blogObj = blog.toObject();
        
        if (blogObj.comments && blogObj.comments.length > 0) {
          blogObj.comments = blogObj.comments.map(comment => {
            const userSpace = userSpaceMap[comment.user._id.toString()];
            return {
              ...comment,
              user: {
                ...comment.user,
                profilePicture: userSpace?.profilePicture || ''
              }
            };
          });
        }
        
        return blogObj;
      });
    }
  }
  
  return result;
};

/**
 * Update blog by id
 * @param {ObjectId} blogId
 * @param {Object} updateBody
 * @param {ObjectId} userId - User making the update
 * @returns {Promise<Blog>}
 */
const updateBlogById = async (blogId, updateBody, userId) => {
  const blog = await Blog.findById(blogId);
  if (!blog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }
  
  // Check if user owns the blog
  if (blog.createdBy.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only update your own blogs');
  }

  Object.assign(blog, updateBody);
  await blog.save();
  return blog;
};

/**
 * Delete blog by id
 * @param {ObjectId} blogId
 * @param {ObjectId} userId - User making the delete request
 * @returns {Promise<Blog>}
 */
const deleteBlogById = async (blogId, userId) => {
  const blog = await Blog.findById(blogId);
  if (!blog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }
  
  // Check if user owns the blog
  if (blog.createdBy.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only delete your own blogs');
  }

  // Soft delete by setting isActive to false
  blog.isActive = false;
  await blog.save();
  return blog;
};

/**
 * Like or unlike a blog
 * @param {ObjectId} blogId
 * @param {ObjectId} userId
 * @returns {Promise<Object>}
 */
const toggleLikeBlog = async (blogId, userId) => {
  const blog = await Blog.findById(blogId);
  if (!blog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }

  const userLikedIndex = blog.likes.indexOf(userId);
  let isLiked;

  if (userLikedIndex > -1) {
    // User already liked, so unlike
    blog.likes.splice(userLikedIndex, 1);
    isLiked = false;
  } else {
    // User hasn't liked, so like
    blog.likes.push(userId);
    isLiked = true;
  }

  blog.likesCount = blog.likes.length;
  await blog.save();

  return {
    isLiked,
    likesCount: blog.likesCount
  };
};

/**
 * Add comment to blog
 * @param {ObjectId} blogId
 * @param {ObjectId} userId
 * @param {string} comment
 * @returns {Promise<Blog>}
 */
const addCommentToBlog = async (blogId, userId, comment) => {
  const blog = await Blog.findById(blogId);
  if (!blog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }

  blog.comments.push({
    user: userId,
    comment: comment,
    createdAt: new Date()
  });

  blog.commentsCount = blog.comments.length;
  await blog.save();

  // Return blog with populated user data for comments
  const populatedBlog = await Blog.findById(blogId)
    .populate('createdBy', 'name email profileImage')
    .populate('comments.user', 'name email profileImage');

  let blogObj = populatedBlog.toObject();
  
  // Add profilePicture from userSpace to createdBy
  if (blogObj.createdBy && blogObj.createdBy._id) {
    const creatorUserSpace = await UserSpace.findOne({ 
      createdBy: blogObj.createdBy._id.toString() 
    }).lean();
    
    if (creatorUserSpace) {
      blogObj.createdBy.profilePicture = creatorUserSpace.profilePicture || '';
    }
  }
  
  // Add profilePicture from userSpace to comments
  blogObj = await enhanceCommentsWithProfilePicture(blogObj);
  
  return blogObj;
};

/**
 * Delete comment from blog
 * @param {ObjectId} blogId
 * @param {ObjectId} commentId
 * @param {ObjectId} userId
 * @returns {Promise<Blog>}
 */
const deleteCommentFromBlog = async (blogId, commentId, userId) => {
  const blog = await Blog.findById(blogId);
  if (!blog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }

  const comment = blog.comments.id(commentId);
  if (!comment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Comment not found');
  }

  // Check if user owns the comment or the blog
  if (comment.user.toString() !== userId && blog.createdBy.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only delete your own comments or comments on your blog');
  }

  blog.comments.pull(commentId);
  blog.commentsCount = blog.comments.length;
  await blog.save();

  // Return blog with populated user data for comments
  const populatedBlog = await Blog.findById(blogId)
    .populate('createdBy', 'name email profileImage')
    .populate('comments.user', 'name email profileImage');

  let blogObj = populatedBlog.toObject();
  
  // Add profilePicture from userSpace to createdBy
  if (blogObj.createdBy && blogObj.createdBy._id) {
    const creatorUserSpace = await UserSpace.findOne({ 
      createdBy: blogObj.createdBy._id.toString() 
    }).lean();
    
    if (creatorUserSpace) {
      blogObj.createdBy.profilePicture = creatorUserSpace.profilePicture || '';
    }
  }
  
  // Add profilePicture from userSpace to comments
  blogObj = await enhanceCommentsWithProfilePicture(blogObj);
  
  return blogObj;
};


/**
 * Increment view count if user hasn't viewed before
 * @param {ObjectId} blogId
 * @param {ObjectId} userId
 * @returns {Promise<Object>}
 */
const incrementViewCount = async (blogId, userId) => {
  const blog = await Blog.findById(blogId);
  
  if (!blog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
  }

  // Check if user has already viewed this blog
  const hasViewed = blog.viewedBy.some(id => id.toString() === userId);
  
  if (!hasViewed) {
    // Add user to viewedBy array
    blog.viewedBy.push(userId);
    await blog.save();
    
    return {
      hasViewed: false,
      newViewCount: blog.viewedBy.length
    };
  }
  
  return {
    hasViewed: true,
    newViewCount: blog.viewedBy.length
  };
};

module.exports = {
  createBlog,
  queryBlogs,
  queryBlogsWithEnhancedComments,
  getBlogById,
  getBlogBySlug,
  getBlogsByUserId,
  updateBlogById,
  deleteBlogById,
  toggleLikeBlog,
  addCommentToBlog,
  deleteCommentFromBlog,
  incrementViewCount,
};
