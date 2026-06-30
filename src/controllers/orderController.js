const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireFields } = require("../utils/validators");
const {
  createOrder,
  getLatestOrder,
  getOrderById,
  getOrders,
} = require("../services/store");

const placeOrder = asyncHandler(async (req, res) => {
  const customer = req.body.customer || {};
  requireFields(customer, ["name", "phone", "address"]);

  if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
    throw new ApiError(400, "Order must contain at least one item.");
  }

  const order = await createOrder(req.user.id, req.body);

  res.status(201).json({
    success: true,
    message: "Order placed successfully.",
    order,
    latestOrder: order,
  });
});

const listOrders = asyncHandler(async (req, res) => {
  const orders = await getOrders(req.user.id);

  res.json({
    success: true,
    count: orders.length,
    orders,
    data: orders,
  });
});

const showLatestOrder = asyncHandler(async (req, res) => {
  const order = await getLatestOrder(req.user.id);

  res.json({
    success: true,
    order,
    latestOrder: order,
  });
});

const showOrder = asyncHandler(async (req, res) => {
  const order = await getOrderById(req.user.id, req.params.id);

  if (!order) {
    throw new ApiError(404, "Order not found.");
  }

  res.json({
    success: true,
    order,
    data: order,
  });
});

module.exports = {
  listOrders,
  placeOrder,
  showLatestOrder,
  showOrder,
};
