const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_yourkey',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'yoursecret'
});

// Create Razorpay Order
const createRazorpayOrder = async (amount, currency = 'INR') => {
  const options = {
    amount: Math.round(amount * 100), // Amount in paisa
    currency,
    receipt: `receipt_order_${Date.now()}`
  };
  return await razorpay.orders.create(options);
};

// Verify Payment Verification
const verifyPayment = async (razorpay_order_id, razorpay_payment_id, razorpay_signature) => {
  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'yoursecret');
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  const generated_signature = hmac.digest('hex');
  return generated_signature === razorpay_signature;
};

module.exports = { createRazorpayOrder, verifyPayment };