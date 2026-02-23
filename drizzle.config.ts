import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/storage/schema/tables.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || '.megasloth/data/megasloth.db',
  },
});
