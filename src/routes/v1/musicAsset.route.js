const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const shareMusicValidation = require('../../validations/shareMusic.validation');
const shareMusicController = require('../../controllers/shareMusic.controller');

const router = express.Router();

router.route('/').post(auth(), shareMusicController.shareAsset);
router.route('/').get(auth(), shareMusicController.getAssets);
router.route('/my-assets').get(auth(), shareMusicController.getMyAssets);
router.route('/:id').get(auth.optionalAuth(), shareMusicController.getAssetsById)
router.route('/cart/:id').post(auth(), shareMusicController.addToCart)
router.route('/my/cart').get(auth(), shareMusicController.getCart)
router.route('/delete/cart/:assetId').delete(auth(), shareMusicController.deleteCart)
router.route('/add/sale').post(auth(), shareMusicController.finalItem)
router.route('/get/sales').get(auth(), shareMusicController.getSales)
router.route('/user-assets-user/:id').get(shareMusicController.getAssetsUser); // tanpa auth, param id diteruskan ke controller


module.exports = router;
