import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// Default to the dev SQLite file next to the schema so it works with zero setup;
// production sets DATABASE_URL to Postgres.
const here = path.dirname(fileURLToPath(import.meta.url));
const defaultUrl = `file:${path.resolve(here, "../../prisma/dev.db")}`;
const url = process.env.DATABASE_URL ?? defaultUrl;

export const prisma = new PrismaClient({ datasources: { db: { url } } });
