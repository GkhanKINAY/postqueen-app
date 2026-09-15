import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./manage.modal.tsx', import.meta.url)),
  'utf8',
);

describe('composer full screen toggle', () => {
  it('opts into full screen from the header without making it the default', () => {
    assert.match(source, /data-pq="composer-fullscreen"/);
    assert.match(source, /enter_full_screen/);
    assert.match(source, /exit_full_screen/);
    assert.match(source, /max-w-\[min\(1440px,calc\(100vw-48px\)\)\]/);
    assert.match(source, /touch \|\| fullScreen/);
  });
});
