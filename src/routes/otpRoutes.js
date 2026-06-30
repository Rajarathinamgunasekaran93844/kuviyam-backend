const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { generateOTP, storeOTP, verifyOTP } = require('../utils/otp');

const router = express.Router();

// Send OTP
router.post('/send', asyncHandler(async (req, res) => {
  const { type, value } = req.body;
  const otp = generateOTP();
  const key = `${type}:${value}`;

  // For demo purposes, we'll log OTP to console!
  console.log(`✅ OTP for ${type} ${value}: ${otp}`);
  
  // If you have real email/SMS setup, uncomment and configure here:
  /*
  if (type === 'email') {
    // Send email using nodemailer
  } else if (type === 'phone') {
    // Send SMS using Twilio or other service
  }
  */

  storeOTP(key, otp);

  res.json({
    success: true, message: 'OTP sent successfully' });
}));

// Verify OTP
router.post('/verify', asyncHandler(async (req, res) => {
  const { type, value, otp } = req.body;
  const key = `${type}:${value}`;
  const result = verifyOTP(key, otp);
  if (!result.valid) {
    res.status(400).json({ success: false, message: result.message });
  } else {
    res.json({ success: true, message: 'OTP verified successfully' });
  }
}));

module.exports = router;