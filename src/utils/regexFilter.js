/**
 * Create an object composed of the picked object properties
 * @param {Object} object
 * @param {string[]} keys
 * @returns {Object}
 */
const regexFilter = (object, keys) => {
  return keys.reduce((obj, key) => {
    if (object && Object.prototype.hasOwnProperty.call(object, key)) {
      // eslint-disable-next-line no-param-reassign
      //   console.log({ $regex: /.${object[key]}./i });
      obj[key] = new RegExp(object[key], 'i');
    }
    return obj;
  }, {});
};

module.exports = regexFilter;
