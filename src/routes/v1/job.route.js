const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const jobValidation = require('../../validations/job.validation');
const jobController = require('../../controllers/job.controller');
const upload = require('../../config/multer');
const { uploadFileToS3 } = require('../../middlewares/upload');
const catchAsync = require('../../utils/catchAsync');

const router = express.Router();

// Separate route for uploading images
router.route('/upload-images').post(
  auth(),
  upload.fields([{ name: 'applicantAvatar', maxCount: 1 }, { name: 'applicantBackgroundImage', maxCount: 1 }]),
  catchAsync(async (req, res) => {
    if (!req.files || (!req.files['applicantAvatar'] && !req.files['applicantBackgroundImage'])) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    let avatarUrl = null;
    let backgroundImageUrl = null;

    if (req.files['applicantAvatar']) {
      const avatarResult = await uploadFileToS3(req.files['applicantAvatar'][0], req.user.id);
      avatarUrl = avatarResult.url;
    }

    if (req.files['applicantBackgroundImage']) {
      const backgroundResult = await uploadFileToS3(req.files['applicantBackgroundImage'][0], req.user.id);
      backgroundImageUrl = backgroundResult.url;
    }

    return res.status(200).json({
      message: 'Files uploaded successfully',
      avatar: avatarUrl,
      backgroundImage: backgroundImageUrl
    });
  })
);

// router.route('/myJobs').get(auth('recruiters'), jobController.getMyJobs);
router.get('/my-jobs', auth(), jobController.getMyJobs)
router.get('/my-jobs-2', auth(), jobController.getMyJobs2)

router.route('/update-job-status/:jobId').put(auth(), validate(jobValidation.changeJobStatus), jobController.changeJobStatus);

// New DELETE route to delete a job
router.route('/:jobId').delete(validate(auth(), jobValidation.getJobById), jobController.deleteJob);

// New PUT route to update a jobrecruiters
router.route('/:jobId').put(auth(), validate(jobValidation.getJobById), jobController.updateJob);

router.post('/add',
  auth(),
  validate(jobValidation.postJob),
  jobController.postJob
);

// router.get('/' ,validate(jobValidation.getJobs), jobController.getJob);
router.get('/', jobController.getJob);
router.get('/:jobId', auth(), validate(jobValidation.getJobById), jobController.getJobById)
// router.put('/:jobId', auth(), validate(jobValidation.getJobById), jobController.saveJob)
router.post('/apply/:jobId', auth(), validate(jobValidation.applyJob), jobController.applyJob);

router.get('/get/applied', auth(), jobController.getAppliedJobs);

// Report job
router.route('/report/:id').post(auth(), jobController.reportJob);

module.exports = router;
