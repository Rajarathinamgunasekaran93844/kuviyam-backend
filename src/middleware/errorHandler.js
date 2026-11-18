const ApiError = require("../utils/ApiError");

const notFound = (req, res, next) => {
  next(new ApiError(404, "Route not found."));
};

const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || error.status || 500;

  if (statusCode >= 500) {
    console.error("Request failed.", {
      code: error.code || "UNKNOWN",
      name: error.name || "Error",
    });
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 413
        ? "The uploaded file is too large."
        : statusCode >= 500 && statusCode !== 503
          ? "Service temporarily unavailable."
          : error.message || "Something went wrong.",
    ...(statusCode < 500 && error.details ? { details: error.details } : {}),
  });
};

module.exports = {
  errorHandler,
  notFound,
};
