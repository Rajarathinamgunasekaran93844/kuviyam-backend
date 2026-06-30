const asyncHandler = require("../utils/asyncHandler");
const { requireEmail, requireFields } = require("../utils/validators");
const { createContactMessage } = require("../services/store");

const sendMessage = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "email", "message"]);
  requireEmail(req.body.email);

  const message = await createContactMessage(req.body);

  res.status(201).json({
    success: true,
    message: "Message received successfully.",
    contactMessage: message,
  });
});

module.exports = {
  sendMessage,
};
