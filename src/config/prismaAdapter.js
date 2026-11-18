const { PrismaPg } = require("@prisma/adapter-pg");

const sslModesToHarden = new Set(["prefer", "require", "verify-ca"]);

const normalizeDatabaseUrl = (connectionString) => {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

    if (
      sslModesToHarden.has(sslMode) ||
      (process.env.NODE_ENV === "production" && sslMode !== "verify-full")
    ) {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {
    return connectionString;
  }

  return connectionString;
};

const redactConnectionString = (connectionString) => {
  try {
    const url = new URL(connectionString);
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return "configured";
  }
};

const createPrismaAdapter = (connectionString) => {
  const poolMax = Number(process.env.DB_POOL_MAX || 10);
  const statementTimeout = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15_000);

  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 50) {
    throw new Error("DB_POOL_MAX must be between 1 and 50.");
  }
  if (!Number.isInteger(statementTimeout) || statementTimeout < 1000) {
    throw new Error("DB_STATEMENT_TIMEOUT_MS must be at least 1000.");
  }

  return new PrismaPg({
    connectionString: normalizeDatabaseUrl(connectionString),
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: statementTimeout,
  });
};

module.exports = {
  createPrismaAdapter,
  normalizeDatabaseUrl,
  redactConnectionString,
};
