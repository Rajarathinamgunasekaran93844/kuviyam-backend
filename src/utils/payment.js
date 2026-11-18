const Razorpay = require("razorpay");
const crypto = require("crypto");
const ApiError = require("./ApiError");

const getCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new ApiError(503, "Online payments are not configured.");
  }
  return { keyId, keySecret };
};

const getRazorpayClient = () => {
  const { keyId, keySecret } = getCredentials();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const getRazorpayKeyId = () => getCredentials().keyId;

const createRazorpayOrder = async (amount, receipt) => {
  const amountInPaise = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(amountInPaise) || amountInPaise < 100) {
    throw new ApiError(400, "The order amount is invalid.");
  }

  return getRazorpayClient().orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt: String(receipt).slice(0, 40),
  });
};

const verifyPayment = (orderId, paymentId, signature) => {
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const { keySecret } = getCredentials();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const received = Buffer.from(signature, "hex");

  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
};

const fetchPayment = async (paymentId) => {
  if (typeof paymentId !== "string" || paymentId.length > 100) {
    throw new ApiError(400, "The payment identifier is invalid.");
  }
  return getRazorpayClient().payments.fetch(paymentId);
};

module.exports = {
  createRazorpayOrder,
  fetchPayment,
  getRazorpayKeyId,
  verifyPayment,
};
