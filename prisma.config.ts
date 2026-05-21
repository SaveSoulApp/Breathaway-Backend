import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url:
      process.env.OPERATION_MODE === 'migration'
        ? env('DIRECT_URL')
        : env('DATABASE_URL'),
  },
});
