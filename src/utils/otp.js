const crypto = require("crypto");

const otpStore = new Map();
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_OTPS = 50_000;
let lastCleanup = 0;

// Generate OTP expires after 10 minutes
const generateOTP = (length = 6) => {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += crypto.randomInt(0, 10).toString();
  }
  return otp;
};

const storeOTP = (key, otp) => {
  const now = Date.now();
  if (now - lastCleanup >= 60_000) {
    for (const [storedKey, entry] of otpStore) {
      if (entry.expiresAt <= now) otpStore.delete(storedKey);
    }
    lastCleanup = now;
  }
  if (otpStore.size >= MAX_ACTIVE_OTPS && !otpStore.has(key)) {
    otpStore.delete(otpStore.keys().next().value);
  }

  otpStore.set(key, {
    digest: crypto.createHash("sha256").update(otp).digest("hex"),
    attempts: 0,
    expiresAt: now + OTP_TTL_MS,
  });
};

const verifyOTP = (key, inputOtp) => {
  const stored = otpStore.get(key);
  if (!stored) return { valid: false, message: 'OTP expired or not found' };
  if (Date.now() >= stored.expiresAt) {
    otpStore.delete(key);
    return { valid: false, message: 'Invalid or expired verification code.' };
  }

  stored.attempts += 1;
  const inputDigest = crypto.createHash("sha256").update(String(inputOtp)).digest();
  const storedDigest = Buffer.from(stored.digest, "hex");
  if (
    stored.attempts > 5 ||
    !crypto.timingSafeEqual(storedDigest, inputDigest)
  ) {
    if (stored.attempts >= 5) otpStore.delete(key);
    return { valid: false, message: 'Invalid or expired verification code.' };
  }
  otpStore.delete(key);
  return { valid: true };
};

const removeOTP = (key) => otpStore.delete(key);

module.exports = { generateOTP, removeOTP, storeOTP, verifyOTP };
