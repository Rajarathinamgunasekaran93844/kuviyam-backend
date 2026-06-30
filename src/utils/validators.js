const ApiError = require("./ApiError");

const requireFields = (body, fields) => {
  const missingFields = fields.filter((field) => {
    const value = body?.[field];
    return value === undefined || value === null || String(value).trim() === "";
  });

  if (missingFields.length > 0) {
    throw new ApiError(
      400,
      `Missing required field${missingFields.length > 1 ? "s" : ""}: ${missingFields.join(", ")}`
    );
  }
};

const requireEmail = (email) => {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(String(email || "").trim())) {
    throw new ApiError(400, "Please provide a valid email address.");
  }
};

const requirePhone = (phone) => {
  // Indian phone number validation (10 digits, starts with 6-9)
  const phonePattern = /^[6-9]\d{9}$/;

  const cleanedPhone = String(phone || "").trim().replace(/[^0-9]/g, "");

  if (!phonePattern.test(cleanedPhone)) {
    throw new ApiError(400, "Please provide a valid 10-digit phone number (starts with 6-9).");
  }

  return cleanedPhone;
};

const toPositiveInt = (value, fieldName) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldName} must be a positive number.`);
  }

  return parsed;
};

module.exports = {
  requireFields,
  requireEmail,
  requirePhone,
  toPositiveInt,
};
