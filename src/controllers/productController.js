const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { getProductById, getProducts } = require("../services/store");

const listProducts = asyncHandler(async (req, res) => {
  const products = await getProducts(req.query);

  res.json({
    success: true,
    count: products.length,
    products,
    data: products,
  });
});

const showProduct = asyncHandler(async (req, res) => {
  const product = await getProductById(req.params.id);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  res.json({
    success: true,
    product,
    data: product,
  });
});

module.exports = {
  listProducts,
  showProduct,
};
