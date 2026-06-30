const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { createRazorpayOrder, verifyPayment } = require('../utils/payment');
const { getOrders } = require('../services/store');
const ApiError = require('../utils/ApiError');

const router = express.Router();

// Create Order
router.post('/create-order', asyncHandler(async (req, res) => {
  const { amount, orderId } = req.body;
  const order = await createRazorpayOrder(amount);
  res.json({
    success: true, order });
}));

// Verify Payment
router.post('/verify', asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
  const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    throw new ApiError(400, "Invalid payment signature");
  }
  // Update order status to paid in DB here (you can update your store.js for this)
  res.json({ success: true, message: "Payment verified successfully" });
}));

module.exports = router;