const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const authenticate = require("../middleware/auth");
const { requireFields } = require("../utils/validators");
const {
  createRazorpayOrder,
  fetchPayment,
  getRazorpayKeyId,
  verifyPayment,
} = require("../utils/payment");
const {
  completePaymentOrder,
  createPendingPaymentOrder,
  getPaymentOrder,
  markPaymentSetupFailed,
  setRazorpayOrderId,
} = require("../services/store");

const router = express.Router();

router.use(authenticate);

router.post("/create-order", asyncHandler(async (req, res) => {
  const customer = req.body.customer || {};
  requireFields(customer, ["name", "phone", "address"]);
  if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
    throw new ApiError(400, "Order must contain at least one item.");
  }

  const keyId = getRazorpayKeyId();
  const order = await createPendingPaymentOrder(req.user.id, req.body);

  try {
    const razorpayOrder = await createRazorpayOrder(
      order.total,
      `kuviyam-${order.id}`
    );
    await setRazorpayOrderId(req.user.id, order.id, razorpayOrder.id);

    res.status(201).json({
      success: true,
      order,
      razorpayOrder,
      keyId,
    });
  } catch (error) {
    try {
      await markPaymentSetupFailed(req.user.id, order.id);
    } catch {
      // Preserve the provider/database error that prevented checkout setup.
    }
    throw error;
  }
}));

router.post("/verify", asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "razorpay_order_id",
    "razorpay_payment_id",
    "razorpay_signature",
  ]);

  const { razorpay_order_id: razorpayOrderId, razorpay_payment_id: paymentId } = req.body;
  const order = await getPaymentOrder(req.user.id, razorpayOrderId);
  if (!order) {
    throw new ApiError(404, "Payment order was not found.");
  }
  if (order.status !== "PENDING_PAYMENT" && order.status !== "PAID") {
    throw new ApiError(409, "This payment order is no longer active.");
  }
  if (!verifyPayment(razorpayOrderId, paymentId, req.body.razorpay_signature)) {
    throw new ApiError(400, "Payment verification failed.");
  }

  const payment = await fetchPayment(paymentId);
  if (
    payment.order_id !== razorpayOrderId ||
    Number(payment.amount) !== Math.round(order.total * 100) ||
    payment.currency !== "INR" ||
    payment.status !== "captured"
  ) {
    throw new ApiError(400, "The payment does not match this order.");
  }

  const paidOrder = await completePaymentOrder(
    req.user.id,
    razorpayOrderId,
    paymentId
  );
  if (!paidOrder) {
    throw new ApiError(404, "Payment order was not found.");
  }

  res.json({
    success: true,
    message: "Payment verified successfully.",
    order: paidOrder,
  });
}));

module.exports = router;
