const Cart = require('../models/cart.model');
const Sale = require('../models/sale.model'); // create sale schema if not exists

// Add item to cart
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.id; // assuming you use auth middleware
    const { assetId } = req.params;

    let cart = await Cart.findOne({ createdBy: userId });
    if (!cart) {
      cart = await Cart.create({ createdBy: userId, cartItems: [] });
    }

    // prevent duplicates
    if (!cart.cartItems.some(item => item.assetId.toString() === assetId)) {
      cart.cartItems.push({ assetId, quantity: 1 });
      await cart.save();
    }

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get current user cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOne({ createdBy: userId })
      .populate({
        path: 'cartItems.assetId',
        populate: {
          path: 'createdBy',
          select: 'name email'
        }
      });
    
    // Return cartItems array directly, or empty array if no cart
    const cartItems = cart ? cart.cartItems : [];
    
    // Debug logging
    console.log('Cart found:', !!cart);
    console.log('Cart items count:', cartItems.length);
    if (cartItems.length > 0) {
      console.log('First cart item structure:', JSON.stringify(cartItems[0], null, 2));
    }
    
    res.status(200).json(cartItems);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: error.message });
  }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { assetId } = req.params;

    const cart = await Cart.findOneAndUpdate(
      { createdBy: userId },
      { $pull: { cartItems: { assetId } } },
      { new: true }
    );

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Pay for cart
exports.payCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { saleData } = req.body;

    // Save sale in DB
    const sale = await Sale.create({
      buyer: userId,
      ...saleData,
    });

    // Optionally clear user cart
    await Cart.findOneAndUpdate({ createdBy: userId }, { cartItems: [] });

    res.status(200).json(sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get sales
exports.getSales = async (req, res) => {
  try {
    const sales = await Sale.find({ buyer: req.user.id });
    res.status(200).json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
