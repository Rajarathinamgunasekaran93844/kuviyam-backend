const nodemailer = require("nodemailer");
const ApiError = require("./ApiError");

const isEmailConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.MAIL_FROM
  );

const sendPasswordResetOtp = async (email, otp) => {
  if (!isEmailConfigured()) {
    throw new ApiError(503, "Password reset email is not configured.");
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ApiError(503, "Password reset email is not configured.");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Your Kuviyam Publications password reset code",
      text: `Your password reset code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    });
  } catch {
    throw new ApiError(503, "Password reset email could not be sent.");
  }
};

module.exports = { isEmailConfigured, sendPasswordResetOtp };
