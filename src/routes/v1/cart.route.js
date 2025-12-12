const express = require('express');
const { addToCart, getCart, removeFromCart, payCart, getSales } = require('../../controllers/cart.controller');

const router = express.Router();

// Add item to cart
// POST /v1/music-asset/cart/:assetId
router.post('/cart/:assetId', addToCart);

// Get current user cart
// GET /v1/music-asset/my/cart
router.get('/my/cart', getCart);

// Remove item from cart
// DELETE /v1/music-asset/delete/cart/:assetId
router.delete('/delete/cart/:assetId', removeFromCart);

// Checkout / pay for cart
// POST /v1/music-asset/add/sale
router.post('/add/sale', payCart);

// Get sales (for user or all, depending on controller logic)
// GET /v1/music-asset/get/sales
router.get('/get/sales', getSales);

module.exports = router;
