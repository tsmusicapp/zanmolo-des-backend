const httpStatus = require('http-status');
const { UserSpace } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a user
 * @param {Object} body
 * @returns {Promise<User>}
 */
const addSpace = async (body) => {
  //   if (await User.isEmailTaken(body.email)) {
  //     throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  //   }
  return UserSpace.create(body);
};

/**
 * Get userSpace by userId
 * @param {string} userId
 * @returns {Promise<User>}
 */
const getSpace = async (createdBy) => {
  return UserSpace.findOne({ createdBy });
};

/**
 * Update user by id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateSpace = async (userId, updateBody) => {
  const userSpace = await getSpace(userId);
  if (!userSpace) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User Space not found');
  }
  Object.assign(userSpace, updateBody);
  await userSpace.save();
  return userSpace;
};

module.exports = {
  getSpace,
  addSpace,
  // editSpace,
  updateSpace,
};
