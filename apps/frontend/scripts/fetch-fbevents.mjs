import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '..', '..', '.env');
const outPath = resolve(__dirname, '..', 'public', 'f.js');

if (!process.env.NEXT_PUBLIC_FACEBOOK_PIXEL && existsSync(envPath)) {
  const content = await readFile(envPath, 'utf8');
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

if (!process.env.NEXT_PUBLIC_FACEBOOK_PIXEL) {
  console.log('[fetch-fbevents] NEXT_PUBLIC_FACEBOOK_PIXEL not set, skipping');
  process.exit(0);
}

const url = 'https://connect.facebook.net/en_US/fbevents.js';
try {
  console.log(`[fetch-fbevents] fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[fetch-fbevents] non-OK response ${res.status}, skipping`);
    process.exit(0);
  }
  const body = await res.text();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, body, 'utf8');
  console.log(`[fetch-fbevents] wrote ${outPath} (${body.length} bytes)`);
} catch (err) {
  console.warn(`[fetch-fbevents] failed: ${err?.message || err}, skipping`);
  process.exit(0);
}
