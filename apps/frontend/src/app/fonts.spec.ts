import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const css = readFileSync(here('./fonts.css'), 'utf8');

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(`${dir}/${entry.name}`)
      : /\.(ts|tsx)$/.test(entry.name)
      ? [`${dir}/${entry.name}`]
      : []
  );

describe('self-hosted fonts', () => {
  it('points every @font-face at a file that exists', () => {
    const urls = [...css.matchAll(/url\(\.\/fonts\/([^)]+)\)/g)].map((m) => m[1]);
    assert.equal(new Set(urls).size, 20);
    for (const file of urls) {
      assert.ok(existsSync(here(`./fonts/${file}`)), `missing fonts/${file}`);
    }
  });

  it('declares every family with its fallback, and the class the layouts use', () => {
    for (const family of ['DM Sans', 'Plus Jakarta Sans', 'JetBrains Mono']) {
      assert.match(css, new RegExp(`font-family:"${family}"`));
      assert.match(css, new RegExp(`font-family:"${family} Fallback"`));
    }
    assert.match(css, /\.pq-fonts \{[\s\S]*--font-dm-sans[\s\S]*--font-jakarta[\s\S]*--font-jetbrains-mono/);
    // The Connect headings' italic accent; it falls back to the system serif.
    assert.match(css, /font-family:"Instrument Serif"; font-style:italic/);
    assert.match(css, /--font-instrument-serif: 'Instrument Serif', Georgia/);
  });

  it('keeps the licence of each family next to the files', () => {
    for (const licence of ['OFL-DMSans.txt', 'OFL-PlusJakartaSans.txt', 'OFL-JetBrainsMono.txt', 'OFL-InstrumentSerif.txt']) {
      assert.match(
        readFileSync(here(`./fonts/${licence}`), 'utf8'),
        /SIL OPEN FONT LICENSE/
      );
    }
  });

  it('never fetches a font from Google at build time again', () => {
    const offenders = sources(here('..')).filter((file) =>
      /from ['"]next\/font\/google['"]/.test(readFileSync(file, 'utf8'))
    );
    assert.deepEqual(offenders, []);
  });
});
