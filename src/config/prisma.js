let prisma = null;
let disabled = false;
const memoryMode =
  process.env.NODE_ENV !== "production" && process.env.DATABASE_MODE === "memory";

const { createPrismaAdapter } = require("./prismaAdapter");
const ApiError = require("../utils/ApiError");

if (memoryMode) {
  disabled = true;
  console.warn("Explicit in-memory development mode is enabled.");
} else if (process.env.DATABASE_URL) {
  try {
    const { PrismaClient } = require("@prisma/client");
    const adapter = createPrismaAdapter(process.env.DATABASE_URL);
    prisma = new PrismaClient({ adapter });
  } catch {
    disabled = true;
    console.error("Prisma could not be initialized. Database requests will be unavailable.");
  }
} else {
  disabled = true;
}

const isExpectedApiError = (error) =>
  error && Number.isInteger(error.statusCode);

const withPrisma = async (operation, fallback) => {
  if (!prisma || disabled) {
    if (memoryMode) return fallback();
    throw new ApiError(503, "Database service is unavailable.");
  }

  try {
    return await operation(prisma);
  } catch (error) {
    if (isExpectedApiError(error)) {
      throw error;
    }

    console.error("Database operation failed.", {
      code: error.code || "UNKNOWN",
    });
    throw new ApiError(503, "Database service is temporarily unavailable.");
  }
};

const checkDatabase = async () => {
  if (memoryMode) return true;
  if (!prisma || disabled) return false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};

const disconnectPrisma = async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
};

module.exports = {
  withPrisma,
  disconnectPrisma,
  checkDatabase,
  isMemoryMode: () => memoryMode,
};
