const httpStatus = require('http-status');
const { Job, AppliedJobs, UserSpace } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a job
 * @param {Object} body
 * @returns {Promise<Job>}
 */
const postJob = async (body) => {
  // Set default status to 'inreview'
  const jobData = {
    ...body,
    status: 'inactive',
  };

  console.log('Job data being saved:', jobData);
  console.log('Position in job data:', jobData.position);
  
  const createdJob = await Job.create(jobData);
  console.log('Created job position:', createdJob.position);
  
  return createdJob;
};

/**
 * Query for music box
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryJobs = async (filter, options) => {
  const jobs = await Job.paginate(filter, options);
  return jobs;
};

const getJobs = async (page, limit) => {
  const skip = (page - 1) * limit;

  const jobs = await Job.find()
    .select('applicantName applicantAvata status createdOn applicantBackgroundImage applicantSelectedSongs budget category createdAt createdBy cultureArea description isHaveLyric id lyricLanguage musicUse preferredLocation projectTitle timeFrame savedBy position designCategory designSubcategory jobType')
    .skip(skip)
    .limit(limit)
    .lean();
  console.log('Jobs:', jobs);
  console.log('First job position:', jobs[0]?.position); 
  // Ambil semua userId unik dari createdBy
  const userIds = [...new Set(jobs.map(job => job.createdBy))];

  // Ambil semua userSpace terkait
  const userSpaces = await UserSpace.find({ createdBy: { $in: userIds } }).lean();
  const userSpaceMap = {};
  userSpaces.forEach(u => {
    userSpaceMap[u.createdBy?.toString()] = u;
  });

  // Gabungkan userSpace ke setiap job
  const jobsWithUserSpace = jobs.map(job => ({
    ...job,
    id: job._id?.toString(),
    userSpace: userSpaceMap[job.createdBy?.toString()] || null,
  }));

  const total = await Job.countDocuments();

  return {
    jobs: jobsWithUserSpace,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalJobs: total
  };
};


/**
 * Get job by id
 * @param {ObjectId} id
 * @returns {Promise<Job>}
 */
const getJobById = async (id) => {
  return Job.findById(id);
};

/**
 * Apply a job
 * @param {Object} body
 * @returns {Promise<AppliedJobs>}
 */
const applyJob = async (body) => {
  return AppliedJobs.create(body);
};

/**
 * Delete a job by id
 * @param {ObjectId} jobId
 * @returns {Promise<void>}
 */
const deleteJob = async (jobId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Job not found');
  }

  // Delete the job from the database
  await job.remove();
};

/**
 * Update a job by id
 * @param {ObjectId} jobId
 * @param {Object} updateData
 * @returns {Promise<Job>}
 */
const updateJob = async (jobId, updateData) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Job not found');
  }

  Object.assign(job, updateData);
  await job.save();  // Save the updated job to the database

  return job;
};

const getMyJobs = async (userId, page, limit) => {
  const skip = (page - 1) * limit;

  const jobs = await Job.find({ createdBy: userId })
    .select('applicantName applicantAvata status createdOn applicantBackgroundImage applicantSelectedSongs budget category createdAt createdBy cultureArea description isHaveLyric id lyricLanguage musicUse preferredLocation projectTitle timeFrame savedBy')
    .skip(skip)
    .limit(limit)
    .lean();

  // Ambil userSpace untuk userId ini
  const userSpace = await UserSpace.findOne({ createdBy: userId }).lean();

  // Gabungkan userSpace ke setiap job
  const jobsWithUserSpace = jobs.map(job => ({
    ...job,
    id: job._id?.toString(),
    userSpace: userSpace || null,
  }));

  const total = await Job.countDocuments({ createdBy: userId });

  return {
    jobs: jobsWithUserSpace,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalJobs: total
  };
};

const getMyJobs2 = async (userId, page, limit) => {
  const skip = (page - 1) * limit;

  const jobs = await Job.find({ createdBy: userId })
    .select('applicantName applicantAvata status createdOn applicantBackgroundImage applicantSelectedSongs budget category createdAt createdBy cultureArea description isHaveLyric id lyricLanguage musicUse preferredLocation projectTitle timeFrame savedBy')
    .skip(skip)
    .limit(limit)
    .lean();

  // Ambil userSpace untuk userId ini
  const userSpace = await UserSpace.findOne({ createdBy: userId }).lean();

  // Untuk setiap job, ambil appliedJobs yang terkait
  const jobsWithAppliedJobs = await Promise.all(jobs.map(async job => {
    const appliedJobs = await AppliedJobs.find({ jobId: job._id }).lean();
    return {
      ...job,
      id: job._id?.toString(),
      userSpace: userSpace || null,
      appliedJobs: appliedJobs || [],
    };
  }));

  const total = await Job.countDocuments({ createdBy: userId });

  return {
    jobs: jobsWithAppliedJobs,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalJobs: total
  };
};


const changeJobStatus = async (jobId, status) => {
  // Validate status
  const validStatuses = ['active', 'inactive', 'inreview'];
  if (!validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status');
  }

  const job = await Job.findByIdAndUpdate(
    jobId,
    { status: status },
    { new: true }
  );

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Job not found');
  }

  return job;
};


const getAppliedJobs = async (userId) => {
  const appliedJobs = await AppliedJobs.find({ createdBy: userId });
  const jobIds = appliedJobs.map(job => job.jobId);
  const jobs = await Job.find({ _id: { $in: jobIds } });
  return jobs;
};

const getApplicationByJobIdAndUserId = async (jobId, userId) => {
  const application = await AppliedJobs.findOne({ jobId, createdBy: userId });
  return application;
};




module.exports = {
  postJob,
  queryJobs,
  getJobById,
  applyJob,
  deleteJob,
  updateJob,
  getJobs,
  getMyJobs,
  getMyJobs2,
  changeJobStatus,
  getAppliedJobs,
  getApplicationByJobIdAndUserId
};
