const Report = require('../models/report.model');

const getAllReports = async () => {
  return Report.find({})
    .populate('userId', 'name email')
    .populate('reportedUserId', 'name email')
    .sort({ createdAt: -1 });
};

const deleteReports = async (ids) => {
  return Report.deleteMany({ _id: { $in: ids } });
};

const createReport = async ({ userId, type, reportedId, reportedUserId, reason, description }) => {
  return Report.create({ userId, type, reportedId, reportedUserId, reason, description });
};

const findReport = async ({ userId, type, reportedId }) => {
  return Report.findOne({ userId, type, reportedId });
};

const getReportsByIds = async (ids) => {
  return Report.find({ _id: { $in: ids } });
};

const countReports = async (filter) => {
  return Report.countDocuments(filter);
};

module.exports = {
  getAllReports,
  deleteReports,
  createReport,
  findReport,
  getReportsByIds,
  countReports,
};
