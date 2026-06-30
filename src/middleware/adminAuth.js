const ApiError = require("../utils/ApiError");

const adminAuth = async (req, res, next) => {
  try {
    // req.user is set by the authenticate middleware
    if (!req.user) {
      throw new ApiError(401, "Unauthorized!");
    }

    // Check if user is admin
    if (!req.user.isAdmin) {
      throw new ApiError(403, "Forbidden! Admin access only!");
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = adminAuth;