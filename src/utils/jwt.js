const jwt = require("jsonwebtoken");

const getSecret = () =>
  process.env.JWT_SECRET || "kuviyam-development-secret";

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    getSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );

const verifyToken = (token) => jwt.verify(token, getSecret());

module.exports = {
  signToken,
  verifyToken,
};
