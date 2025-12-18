const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createBlog = {
  body: Joi.object().keys({
    title: Joi.string().required().trim().min(1).max(200),
    description: Joi.string().required().min(1), // Rich text HTML
    classification: Joi.array().items(Joi.string().trim().min(1).max(100)).min(1).required(),
    status: Joi.string().valid('draft', 'published').default('published'),
  }),
};

const getBlogs = {
  query: Joi.object().keys({
    title: Joi.string(),
    classification: Joi.string().trim().min(1).max(100),
    userName: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getBlogSlug = {
  params: Joi.object().keys({
    slug: Joi.string().min(1).max(500).required(),
  }),
};

const getBlog = {
  params: Joi.object().keys({
    blogId: Joi.string().custom(objectId),
  }),
};

const updateBlog = {
  params: Joi.object().keys({
    blogId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string().trim().min(1).max(200),
      description: Joi.string().min(1), // Rich text HTML
      classification: Joi.array().items(Joi.string().trim().min(1).max(100)).min(1),
      status: Joi.string().valid('draft', 'published'),
    })
    .min(1),
};

const deleteBlog = {
  params: Joi.object().keys({
    blogId: Joi.string().custom(objectId),
  }),
};

const likeBlog = {
  params: Joi.object().keys({
    blogId: Joi.string().custom(objectId),
  }),
};

const commentBlog = {
  params: Joi.object().keys({
    blogId: Joi.string().custom(objectId),
  }),
  body: Joi.object().keys({
    comment: Joi.string().min(1).max(500).required().messages({
      'string.min': 'Comment must be at least 1 character long',
      'string.max': 'Comment must not exceed 500 characters',
    }),
  }),
};

const deleteComment = {
  params: Joi.object().keys({
    blogId: Joi.string().custom(objectId),
    commentId: Joi.string().custom(objectId),
  }),
};

const getBlogsByUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
  query: Joi.object().keys({
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const playBlog = {
  params: Joi.object().keys({
    blogId: Joi.string().custom(objectId),
  }),
};

const reportBlog = {
  params: Joi.object().keys({
    blogId: Joi.string().custom(objectId),
  }),
  body: Joi.object().keys({
    reason: Joi.string().min(3).max(100).required(),
    description: Joi.string().max(500).allow(''),
  }),
};

module.exports = {
  createBlog,
  getBlogs,
  getBlog,
  getBlogSlug,
  updateBlog,
  deleteBlog,
  likeBlog,
  commentBlog,
  deleteComment,
  getBlogsByUser,
  playBlog,
  reportBlog,
};
