#!/usr/bin/env node
// Draws the PNGs the emails show (libraries/nestjs-libraries/src/emails/email.layout.ts)
// into apps/frontend/public/email: the logo tile, and every status icon in every
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

const png = (svg, size, file, palette = true) =>
  sharp(Buffer.from(svg), { density: 600 })
    .resize(size, size)
    .png({ compressionLevel: 9, palette })
    .toFile(join(out, file));

// The brand mark (crown speech bubble) on its gradient tile, the same drawing as
// the app icon and the logo on the Google consent screen. Not palette-reduced:
// a 256-colour palette bands the gradient.
const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">' +
  '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="512" y2="512">' +
  '<stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#6D28D9"/></linearGradient></defs>' +
  '<rect width="512" height="512" rx="112" fill="url(#g)"/>' +
  '<path d="M118 268L128 172L192 218L256 134L320 218L384 172L394 268L360 240L152 240ZM162 354L146 406L226 360Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="20" stroke-linejoin="round"/>' +
  '<path d="M106 164A22 22 0 1 0 150 164A22 22 0 1 0 106 164ZM232 122A24 24 0 1 0 280 122A24 24 0 1 0 232 122ZM362 164A22 22 0 1 0 406 164A22 22 0 1 0 362 164ZM154 222H358A46 46 0 0 1 404 268V324A46 46 0 0 1 358 370H154A46 46 0 0 1 108 324V268A46 46 0 0 1 154 222ZM173 296A19 19 0 1 0 211 296A19 19 0 1 0 173 296ZM237 296A19 19 0 1 0 275 296A19 19 0 1 0 237 296ZM301 296A19 19 0 1 0 339 296A19 19 0 1 0 301 296Z" fill="#FFFFFF" fill-rule="evenodd"/></svg>';

const jobs = [
  // Drawn at 3x for a 30px slot. The emails load logo-v2.png: Gmail's image
  // proxy keeps a URL's first image, so the new mark needs a new name.
  // logo.png gets the same image for mail sent before the rename.
  png(LOGO, 90, 'logo-v2.png', false),
  png(LOGO, 90, 'logo.png', false),
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
