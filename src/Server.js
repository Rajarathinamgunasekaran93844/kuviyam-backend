require("dotenv").config();

const app = require("./App");
const { disconnectPrisma } = require("./config/prisma");

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const shutdown = async () => {
  console.log("\n🛑 Shutting down server...");

  try {
    await disconnectPrisma();
    console.log("✅ Prisma disconnected");
  } catch (error) {
    console.error("❌ Error disconnecting Prisma:", error);
  }

  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Rejection:", error);
  process.exit(1);
});