import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from '@prisma/config';

/**
 * Prisma 7 config file.
 *
 * In Prisma 7 the datasource URL no longer lives inside schema.prisma —
 * Migrate and introspection read it from this file. The PrismaClient
 * itself reaches Postgres via the `@prisma/adapter-pg` driver adapter
 * wired up in src/infrastructure/database/prisma.service.ts.
 *
 * The schema is split across `prisma/schema/*.prisma` — one file per
 * Bounded Context. Every BC file shares the single datasource + generator
 * declared in `prisma/schema/main.prisma`.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // Only set shadowDatabaseUrl when explicitly provided — Prisma rejects
    // a shadow URL identical to the main URL, but `migrate diff` needs one
    // to diff from a migrations directory. CI sets SHADOW_DATABASE_URL only
    // for the drift-check step against a separate temporary DB.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
