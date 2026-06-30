const asyncHandler = require("../utils/asyncHandler");
const { toPositiveInt } = require("../utils/validators");
const {
  addWishlistItem,
  getWishlist,
  removeWishlistItem,
} = require("../services/store");

const listWishlist = asyncHandler(async (req, res) => {
  console.log("📋 listWishlist called with userId:", req.user.id);
  const wishlist = await getWishlist(req.user.id);
  console.log("📋 Wishlist found:", wishlist);

  res.json({
    success: true,
    count: wishlist.length,
    wishlist,
    data: wishlist,
  });
});

const addItem = asyncHandler(async (req, res) => {
  console.log("➕ addItem called with userId:", req.user.id, "and productId:", req.body.productId || req.params.productId);
  const productId = toPositiveInt(
    req.body.productId || req.params.productId,
    "Product id"
  );
  const wishlist = await addWishlistItem(req.user.id, productId);
  console.log("➕ Updated wishlist:", wishlist);

  res.status(201).json({
    success: true,
    message: "Product added to wishlist.",
    count: wishlist.length,
    wishlist,
    data: wishlist,
  });
});

const removeItem = asyncHandler(async (req, res) => {
  console.log("➖ removeItem called with userId:", req.user.id, "and productId:", req.params.productId);
  const productId = toPositiveInt(req.params.productId, "Product id");
  const wishlist = await removeWishlistItem(req.user.id, productId);
  console.log("➖ Updated wishlist:", wishlist);

  res.json({
    success: true,
    message: "Product removed from wishlist.",
    count: wishlist.length,
    wishlist,
    data: wishlist,
  });
});

module.exports = {
  addItem,
  listWishlist,
  removeItem,
};
