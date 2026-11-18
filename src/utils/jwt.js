const jwt = require("jsonwebtoken");

const getSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }

  return secret;
};

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    getSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    }
  );

const verifyToken = (token) => jwt.verify(token, getSecret());

module.exports = {
  signToken,
  verifyToken,
  validateSecret: getSecret,
};
