const asyncHandler = require("../utils/asyncHandler");
const {
  getAdminStats,
  getAllOrders,
  getAllUsers,
  getAllProducts,
  getAllContactMessages,
  getAllWishlist,
  createProduct,
  deleteProduct,
  updateProduct,
} = require("../services/store");

const getStats = asyncHandler(async (req, res) => {
  const stats = await getAdminStats();
  res.status(200).json({
    success: true,
    stats,
  });
});

const getOrders = asyncHandler(async (req, res) => {
  const orders = await getAllOrders();
  res.status(200).json({
    success: true,
    orders,
    count: orders.length,
  });
});

const getUsers = asyncHandler(async (req, res) => {
  const users = await getAllUsers();
  res.status(200).json({
    success: true,
    users,
    count: users.length,
  });
});

const getProducts = asyncHandler(async (req, res) => {
  const products = await getAllProducts();
  res.status(200).json({
    success: true,
    products,
    count: products.length,
  });
});

const getMessages = asyncHandler(async (req, res) => {
  const messages = await getAllContactMessages();
  res.status(200).json({
    success: true,
    messages,
    count: messages.length,
  });
});

const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await getAllWishlist();
  res.status(200).json({
    success: true,
    wishlist,
    count: wishlist.length,
  });
});

const createProductHandler = asyncHandler(async (req, res) => {
  const product = await createProduct(req.body);
  res.status(201).json({
    success: true,
    product,
  });
});

const deleteProductHandler = asyncHandler(async (req, res) => {
  const product = await deleteProduct(req.params.id);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }
  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
    product,
  });
});

const updateProductHandler = asyncHandler(async (req, res) => {
  const product = await updateProduct(req.params.id, req.body);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }
  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    product,
  });
});

module.exports = {
  getStats,
  getOrders,
  getUsers,
  getProducts,
  getMessages,
  getWishlist,
  createProduct: createProductHandler,
  deleteProduct: deleteProductHandler,
  updateProduct: updateProductHandler,
};
