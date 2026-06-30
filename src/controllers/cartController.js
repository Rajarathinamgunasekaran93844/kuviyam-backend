const asyncHandler = require("../utils/asyncHandler");
const { toPositiveInt } = require("../utils/validators");
const {
  addToCart,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} = require("../services/store");

const sendCart = (res, cart, message = null) => {
  res.json({
    success: true,
    ...(message ? { message } : {}),
    ...cart,
    data: cart.cartItems,
  });
};

const listCart = asyncHandler(async (req, res) => {
  sendCart(res, await getCart(req.user.id));
});

const addItem = asyncHandler(async (req, res) => {
  const cart = await addToCart(req.user.id, req.body);
  sendCart(res, cart, "Product added to cart.");
});

const updateItem = asyncHandler(async (req, res) => {
  const productId = toPositiveInt(req.params.productId, "Product id");
  const quantity = toPositiveInt(req.body.quantity, "Quantity");
  const cart = await updateCartItem(req.user.id, productId, quantity);

  sendCart(res, cart, "Cart item updated.");
});

const removeItem = asyncHandler(async (req, res) => {
  const productId = toPositiveInt(req.params.productId, "Product id");
  const cart = await removeCartItem(req.user.id, productId);

  sendCart(res, cart, "Product removed from cart.");
});

const clear = asyncHandler(async (req, res) => {
  const cart = await clearCart(req.user.id);
  sendCart(res, cart, "Cart cleared.");
});

module.exports = {
  addItem,
  clear,
  listCart,
  removeItem,
  updateItem,
};
