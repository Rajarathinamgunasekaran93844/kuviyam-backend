const ApiError = require("../utils/ApiError");
const { verifyToken } = require("../utils/jwt");
const { getUserById } = require("../services/store");

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      throw new ApiError(401, "Authentication token is required.");
    }

    const decoded = verifyToken(token);
    const user = await getUserById(decoded.id);

    if (!user) {
      throw new ApiError(401, "User account was not found.");
    }

    req.user = user;
    next();
  } catch (error) {
    next(
      error.statusCode
        ? error
        : new ApiError(401, "Invalid or expired authentication token.")
    );
  }
};

module.exports = authenticate;
