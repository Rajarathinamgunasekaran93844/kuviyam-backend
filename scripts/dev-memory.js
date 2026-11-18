const crypto = require("node:crypto");

process.env.NODE_ENV = "development";
process.env.DATABASE_MODE = "memory";
process.env.HOST = process.env.DEV_HOST || "127.0.0.1";
process.env.PORT = process.env.PORT || "5000";
process.env.CLIENT_URL = "http://localhost:5173,http://127.0.0.1:5173";
process.env.TRUST_PROXY_HOPS = "0";
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");

for (const name of [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
]) {
  process.env[name] = "";
}

require("../src/Server");
