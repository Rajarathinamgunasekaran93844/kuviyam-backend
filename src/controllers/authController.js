const asyncHandler = require("../utils/asyncHandler");
const { signToken } = require("../utils/jwt");
const {
  requireEmail,
  requireFields,
  requirePhone
} = require("../utils/validators");
const {
  getUserByEmail,
  loginUser,
  registerUser,
  updateUser,
} = require("../services/store");
const ApiError = require("../utils/ApiError");
const { generateOTP, removeOTP, storeOTP, verifyOTP } = require("../utils/otp");
const { isEmailConfigured, sendPasswordResetOtp } = require("../utils/email");

const passwordResetKey = (email) => `password-reset:${String(email || "").trim().toLowerCase()}`;

const requirePassword = (password) => {
  if (!password || String(password).length < 12) {
    throw new ApiError(400, "Password must be at least 12 characters long.");
  }
};

const requireText = (value, field, maxLength, allowEmpty = false) => {
  if (typeof value !== "string") {
    throw new ApiError(400, `${field} must be text.`);
  }
  const text = value.trim();
  if (!allowEmpty && !text) throw new ApiError(400, `${field} is required.`);
  if (text.length > maxLength) {
    throw new ApiError(400, `${field} must not exceed ${maxLength} characters.`);
  }
  return text;
};

const register = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "email", "phone", "address", "password"]);
  requireEmail(req.body.email);
  requirePassword(req.body.password);
  const cleanedPhone = requirePhone(req.body.phone);
  const name = requireText(req.body.name, "Name", 120);
  const address = requireText(req.body.address, "Address", 500);

  if (
    req.body.confirmPassword !== undefined &&
    req.body.password !== req.body.confirmPassword
  ) {
    throw new ApiError(400, "Passwords do not match.");
  }

  const user = await registerUser({
    ...req.body,
    name,
    phone: cleanedPhone,
    address,
  });
  const token = signToken(user);

  res.status(201).json({
    success: true,
    message: "Registration successful.",
    user,
    token,
  });
});

const login = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "password"]);
  requireEmail(req.body.email);

  const user = await loginUser(req.body);
  const token = signToken(user);

  res.json({
    success: true,
    message: "Login successful.",
    user,
    token,
  });
});

const me = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const updateData = { ...req.body };

  if (req.body.password !== undefined) {
    requirePassword(req.body.password);
  }

  if (req.body.name !== undefined) {
    updateData.name = requireText(req.body.name, "Name", 120);
  }

  if (req.body.address !== undefined) {
    updateData.address = requireText(req.body.address, "Address", 500, true);
  }

  if (req.body.email !== undefined) {
    requireEmail(req.body.email);
  }

  if (req.body.phone !== undefined) {
    updateData.phone = requirePhone(req.body.phone);
  }

  const user = await updateUser(req.user.id, updateData);

  res.json({
    success: true,
    message: "Profile updated successfully.",
    user,
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email"]);
  requireEmail(req.body.email);

  if (!isEmailConfigured()) {
    throw new ApiError(503, "Password reset email is not configured.");
  }

  const user = await getUserByEmail(req.body.email);
  const response = {
    success: true,
    message: "If an account exists with this email, a password reset OTP has been sent.",
  };

  if (!user) {
    return res.status(202).json(response);
  }

  const otp = generateOTP();
  storeOTP(passwordResetKey(req.body.email), otp);

  try {
    await sendPasswordResetOtp(req.body.email, otp);
  } catch (error) {
    removeOTP(passwordResetKey(req.body.email));
    throw error;
  }

  res.status(202).json(response);
});

const resetPassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "otp", "password", "confirmPassword"]);
  requireEmail(req.body.email);
  requirePassword(req.body.password);

  if (req.body.password !== req.body.confirmPassword) {
    throw new ApiError(400, "Passwords do not match.");
  }

  const result = verifyOTP(passwordResetKey(req.body.email), String(req.body.otp).trim());

  if (!result.valid) {
    throw new ApiError(400, "Invalid or expired verification code.");
  }

  const user = await getUserByEmail(req.body.email);
  if (!user) {
    throw new ApiError(400, "Invalid or expired verification code.");
  }

  await updateUser(user.id, {
    password: req.body.password,
  });

  res.json({
    success: true,
    message: "Password reset successfully. You can now log in with your new password.",
  });
});

module.exports = {
  forgotPassword,
  login,
  me,
  register,
  resetPassword,
  updateProfile,
};
