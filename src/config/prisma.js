let prisma = null;
let disabled = false;

const {
  createPrismaAdapter,
  redactConnectionString,
} = require("./prismaAdapter");

console.log("=== Prisma Config Debug ===");
console.log("DATABASE_URL loaded:", !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  console.log("DATABASE_URL target:", redactConnectionString(process.env.DATABASE_URL));
}

try {
  const { PrismaClient } = require("@prisma/client");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  const adapter = createPrismaAdapter(process.env.DATABASE_URL);

  prisma = new PrismaClient({ adapter });
  console.log("PrismaClient initialized successfully.");
} catch (error) {
  disabled = true;
  console.error("Prisma initialization error:", error);
  console.warn(
    `Prisma database mode is disabled (${error.message}). API will use in-memory data.`
  );
}

const isExpectedApiError = (error) =>
  error && Number.isInteger(error.statusCode);

const withPrisma = async (operation, fallback) => {
  if (!prisma || disabled) {
    return fallback();
  }

  try {
    return await operation(prisma);
  } catch (error) {
    if (isExpectedApiError(error)) {
      throw error;
    }

    disabled = true;
    console.warn(
      `Prisma is unavailable for this process (${error.message}). Falling back to in-memory data.`
    );

    return fallback(error);
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
};
