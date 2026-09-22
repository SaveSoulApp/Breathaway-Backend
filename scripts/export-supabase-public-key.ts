//RUN
//node --env-file=.env -r ts-node/register scripts/export-supabase-public-key.ts

import { createPrivateKey } from 'crypto';

function exportKeys() {
  const rawKey = process.env.SUPABASE_JWT_PRIVATE_KEY;

  if (!rawKey) {
    console.error(
      'Error: SUPABASE_JWT_PRIVATE_KEY environment variable is not set.',
    );
    console.error(
      'Usage: node --env-file=.env -r ts-node/register scripts/export-supabase-public-key.ts',
    );
    console.error(
      '   or: SUPABASE_JWT_PRIVATE_KEY="..." npx ts-node scripts/export-supabase-public-key.ts',
    );
    process.exit(1);
  }

  const formattedKey = rawKey.replace(/\\n/g, '\n');

  try {
    const privKey = createPrivateKey(formattedKey);
    const privJwk = privKey.export({ format: 'jwk' });

    console.log('\n======================================================');
    console.log('PASTE THIS INTO SUPABASE "Import an existing private key":');
    console.log('======================================================\n');
    console.log(JSON.stringify(privJwk, null, 2));

    console.log('\n======================================================');
    console.log('NEXT STEPS IN SUPABASE DASHBOARD:');
    console.log('======================================================');
    console.log('1. Click "Create standby key".');
    console.log('2. Check "Import an existing private key".');
    console.log('3. Paste the JWK JSON from above (including curly braces).');
    console.log('4. Click "Create standby key" to save.');
    console.log(
      '5. Once created, click "Rotate keys" to promote it to the active key.',
    );
    console.log('6. Copy the assigned Key ID ("kid") from the key row.');
    console.log(
      '7. Set SUPABASE_JWT_KEY_ID=<copied-kid> in your .env, scripts/common.dev.sh, and Secret Manager.',
    );
    console.log('======================================================\n');
  } catch (err: unknown) {
    console.error('Failed to parse or export keys:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

exportKeys();
