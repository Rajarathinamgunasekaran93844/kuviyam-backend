const express = require("express");

const authenticate = require("../middleware/auth");
const {
  forgotPassword,
  login,
  me,
  register,
  resetPassword,
  updateProfile,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", authenticate, me);
router.patch("/profile", authenticate, updateProfile);
router.put("/profile", authenticate, updateProfile);

module.exports = router;
