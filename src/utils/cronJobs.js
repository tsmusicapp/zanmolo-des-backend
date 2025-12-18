const cron = require('node-cron');
const AccountCleanupService = require('../services/accountCleanup.service');

/**
 * Initialize all cron jobs
 */
function initializeCronJobs() {

  // Run account cleanup daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      await AccountCleanupService.processScheduledDeletions();
    } catch (error) {
      console.error('Account cleanup failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "UTC"
  });

  // Testing: Run cleanup every minute (uncomment for testing)
  // cron.schedule('* * * * *', async () => {
  //   console.log('Running account cleanup (testing - every minute)...');
  //   try {
  //     const result = await AccountCleanupService.processScheduledDeletions();
  //     console.log('Account cleanup completed:', result);
  //   } catch (error) {
  //     console.error('Account cleanup failed:', error);
  //   }
  // }, {
  //   scheduled: true,
  //   timezone: "UTC"
  // });

}

module.exports = {
  initializeCronJobs
};
