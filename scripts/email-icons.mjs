#!/usr/bin/env node
// Draws the PNGs the emails show (libraries/nestjs-libraries/src/emails/email.layout.ts)
// into apps/frontend/public/email: the crown tile, and every status icon in every
// tone. PNG, because Gmail does not show SVG. Icon geometry is Lucide's (ISC).
//
//   node scripts/email-icons.mjs
//
// The tone colours sit between the light and dark tile backgrounds, so one file
// reads in both themes.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/frontend/public/email',
);
mkdirSync(out, { recursive: true });

const TONES = {
  brand: '#8B5CF6',
  ok: '#16A34A',
  warn: '#D97706',
  danger: '#E11D48',
  streak: '#EA580C',
};

const ICONS = {
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'check-check': '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'mail-check':
    '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  rss: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  'shield-alert':
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  'user-cog':
    '<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m19.1 12.2.3-.9"/><path d="m19.6 18.7-.4-1"/><path d="m16.8 12.3-.4-1"/><path d="m14.3 16.6 1-.4"/><path d="m20.7 13.8 1-.4"/>',
  'x-circle':
    '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
};

const png = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 600 })
    .resize(size, size)
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(out, file));

const jobs = [
  // The crown tile from the site's logo, drawn at 3x for a 30px slot.
  png(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="8" fill="#7C3AED"/>' +
      '<path d="M6.6 20.4 L8.2 10.6 L12.4 14.4 L16 8 L19.6 14.4 L23.8 10.6 L25.4 20.4 Z" fill="#FFFFFF"/>' +
      '<rect x="7" y="21.8" width="18" height="2.6" rx="1.3" fill="#FFFFFF"/></svg>',
    90,
    'logo.png',
  ),
];
for (const [name, paths] of Object.entries(ICONS)) {
  for (const [tone, color] of Object.entries(TONES)) {
    jobs.push(
      png(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
          `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
        72,
        `${name}-${tone}.png`,
      ),
    );
  }
}
await Promise.all(jobs);
console.log(`${jobs.length} images -> ${out}`);
