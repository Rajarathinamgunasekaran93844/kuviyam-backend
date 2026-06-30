const otpStore = new Map(); // In-memory store, for demo purposes

// Generate OTP expires after 10 minutes
const generateOTP = (length = 6) => {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10).toString();
  }
  return otp;
};

const storeOTP = (key, otp) => {
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
  });
};

const verifyOTP = (key, inputOtp) => {
  const stored = otpStore.get(key);
  if (!stored) return { valid: false, message: 'OTP expired or not found' };
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    return { valid: false, message: 'OTP expired' };
  }
  if (stored.otp !== inputOtp) {
    return { valid: false, message: 'Invalid OTP' };
  }
  otpStore.delete(key);
  return { valid: true };
};

module.exports = { generateOTP, storeOTP, verifyOTP };