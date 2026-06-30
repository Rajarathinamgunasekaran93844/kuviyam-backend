const { PrismaPg } = require("@prisma/adapter-pg");

const sslModesToHarden = new Set(["prefer", "require", "verify-ca"]);

const normalizeDatabaseUrl = (connectionString) => {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

    if (sslModesToHarden.has(sslMode)) {
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

const createPrismaAdapter = (connectionString) =>
  new PrismaPg(normalizeDatabaseUrl(connectionString));

module.exports = {
  createPrismaAdapter,
  normalizeDatabaseUrl,
  redactConnectionString,
};
