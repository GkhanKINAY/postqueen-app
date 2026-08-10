import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved schema location and migration settings out of CLI flags and
 * into this file — `--schema` is gone, and so is the automatic `.env` load that
 * every one of those commands relied on. Hence the `dotenv/config` import at
 * the top: without it `DATABASE_URL` is undefined and `migrate deploy` fails
 * with a message about a missing datasource rather than a missing env file.
 */
export default defineConfig({
  schema: 'libraries/nestjs-libraries/src/database/prisma/schema.prisma',
  migrations: {
    path: 'libraries/nestjs-libraries/src/database/prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
