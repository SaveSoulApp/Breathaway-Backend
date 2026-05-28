import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Minimal .env file parser — only handles KEY=VALUE and KEY="VALUE" lines.
 * Avoids a runtime `dotenv` dependency that may not be installed.
 */
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed.slice(eqIdx + 1).trim();
    const value = raw.replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export default async function globalSetup(): Promise<void> {
  // Enforce UTC timezone to match main.ts
  process.env.TZ = 'UTC';

  // Load .env.test so DATABASE_URL is available for the Prisma CLI subprocess.
  // We do NOT overwrite vars that are already set (e.g. by CI).
  loadEnvFile(path.resolve(process.cwd(), '.env.test'));

  // Run pending migrations against the test database.
  // `prisma migrate deploy` is idempotent — safe to call on every run.
  // It also implicitly creates the schema if it does not yet exist.
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });
}
