import "dotenv/config";

import {
  defineConfig,
  env,
} from "prisma/config";

export default defineConfig({
  schema:
    "prisma/schema.prisma",

  migrations: {
    path:
      "prisma/migrations",
  },

  datasource: {
    // Use Neon’s direct connection for Prisma CLI migrations. Runtime API
    // connections continue to use the pooled DATABASE_URL.
    url: process.env.DIRECT_DATABASE_URL || env("DATABASE_URL"),
  },
});
