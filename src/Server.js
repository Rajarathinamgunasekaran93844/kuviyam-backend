require("dotenv").config();

const { validateSecret } = require("./utils/jwt");

try {
  validateSecret();
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured in production.");
  }
} catch (error) {
  console.error("Startup configuration is invalid:", error.message);
  process.exit(1);
}

const app = require("./App");
const { disconnectPrisma } = require("./config/prisma");

const PORT = Number(process.env.PORT || 5000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("PORT must be a valid TCP port number.");
  process.exit(1);
}

const HOST = process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

const server = app.listen(PORT, HOST, () => {
  console.log(`Kuviyam API listening on ${HOST}:${PORT}.`);
});
server.requestTimeout = 120_000;
server.headersTimeout = 15_000;

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;

  const forceClose = setTimeout(() => server.closeAllConnections(), 10_000);
  forceClose.unref();

  server.close(async () => {
    clearTimeout(forceClose);
    try {
      await disconnectPrisma();
    } catch {
      console.error("Database disconnect failed during shutdown.");
    }
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error?.name || "Error", error?.code || "UNKNOWN");
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error?.name || "Error", error?.code || "UNKNOWN");
  process.exit(1);
});
