const ContactUs = require('../models/contactUs.model');
const httpStatus = require('http-status');

const getAllContactUs = async (req, res) => {
  // Only allow admin
  if (!req.user || req.user.role !== 'admin') {
    return res.status(httpStatus.FORBIDDEN).json({ message: 'Forbidden: Admins only' });
  }
  const contacts = await ContactUs.find().sort({ createdAt: -1 });
  return res.status(200).json(contacts);
};

module.exports = {
  getAllContactUs,
};
