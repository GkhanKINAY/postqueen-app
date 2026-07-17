import { PostgresStore } from '@mastra/pg';

export const pStore = new PostgresStore({
  id: 'postqueen-store',
  connectionString: process.env.DATABASE_URL!,
});
