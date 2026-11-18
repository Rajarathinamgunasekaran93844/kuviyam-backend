const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireEmail, requireFields } = require("../utils/validators");
const { createContactMessage } = require("../services/store");

const sendMessage = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "email", "message"]);
  requireEmail(req.body.email);

  const name = req.body.name.trim();
  const messageText = req.body.message.trim();
  if (name.length > 120) {
    throw new ApiError(400, "Name must not exceed 120 characters.");
  }
  if (messageText.length > 5_000) {
    throw new ApiError(400, "Message must not exceed 5,000 characters.");
  }

  const message = await createContactMessage({
    name,
    email: req.body.email.trim(),
    message: messageText,
  });

  res.status(201).json({
    success: true,
    message: "Message received successfully.",
    contactMessage: message,
  });
});

module.exports = {
  sendMessage,
};
