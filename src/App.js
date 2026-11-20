const express = require("express");
const cors = require("cors");
const createRateLimiter = require("./middleware/rateLimit");
const { checkDatabase, isMemoryMode } = require("./config/prisma");

const authRoutes = require("./routes/authRoutes");
const cartRoutes = require("./routes/cartRoutes");
const contactRoutes = require("./routes/contactRoutes");
const orderRoutes = require("./routes/orderRoutes");
const productRoutes = require("./routes/productRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const galleryRoutes = require("./routes/galleryRoutes");
const blogRoutes = require("./routes/blogRoutes");
const { handleMuxWebhook } = require("./controllers/galleryController");
const {
  errorHandler,
  notFound,
} = require("./middleware/errorHandler");

const app = express();

app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

const allowedOrigins = (process.env.CLIENT_URL ||
  "https://kuviyam-ecommerce.vercel.app,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  if (process.env.NODE_ENV === "production") {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without origin (Postman, mobile apps, browser direct access)
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
  })
);

// Mux signature verification requires the untouched request body.
app.post(
  "/api/webhooks/mux",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleMuxWebhook
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb", parameterLimit: 50 }));

const apiLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 1200 });
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Try again in 15 minutes.",
});
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const resetLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const contactLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const paymentLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

app.use("/api", apiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/forgot-password", resetLimiter);
app.use("/api/auth/reset-password", resetLimiter);
app.use("/api/contact", contactLimiter);
app.use("/api/payment", paymentLimiter);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Kuviyam Publications API Running",
    api: "/api",
  });
});

app.get("/api/health", async (req, res, next) => {
  try {
    const database = await checkDatabase();
    const status = database ? 200 : 503;
    res.status(status).json({
      success: database,
      status: database ? "healthy" : "degraded",
      database: isMemoryMode() ? "memory" : database ? "connected" : "unavailable",
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/gallery", galleryRoutes);
app.use("/api/blogs", blogRoutes);


app.use(notFound);
app.use(errorHandler);

module.exports = app;
