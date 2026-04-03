const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env.local") });

/** @type { import("drizzle-kit").Config } */
module.exports = {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://127.0.0.1:5432/placeholder?sslmode=disable",
  },
};
