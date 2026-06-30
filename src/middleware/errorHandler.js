const ApiError = require("../utils/ApiError");

const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
};

const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || error.status || 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 413
        ? "The uploaded file is too large."
        : error.message || "Something went wrong.",
    ...(error.details ? { details: error.details } : {}),
  });
};

module.exports = {
  errorHandler,
  notFound,
};
