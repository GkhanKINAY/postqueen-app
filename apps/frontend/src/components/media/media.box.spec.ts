import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./media.box.tsx', import.meta.url)),
  'utf8',
);
const uploader = readFileSync(
  fileURLToPath(new URL('./new.uploader.tsx', import.meta.url)),
  'utf8',
);

describe('Media library thumbnails', () => {
  it('are square tiles, not 4/3 banners', () => {
    assert.match(source, /MEDIA_LIBRARY_THUMB_ASPECT = 'aspect-square'/);
    assert.match(source, /MEDIA_LIBRARY_THUMB_FILL = 'absolute inset-0 h-full w-full'/);
    assert.doesNotMatch(source, /aspect-\[4\/3\]/);
  });

  it('crops the drop-zone and picker grids with object-cover', () => {
    assert.match(source, /data-pq="media-grid"/);
    assert.match(source, /data-pq="media-library-grid"/);
    // Two real thumbs plus the uploading tile's skeleton, which fills the
    // same frame so the grid does not shift when the file lands.
    assert.equal(
      source.split('className={MEDIA_LIBRARY_THUMB_FILL}').length - 1,
      3
    );
    assert.match(source, /className="h-full w-full object-cover"/);
  });

  it('shows a file on its way in as a tile with its percentage, in both grids', () => {
    assert.match(source, /data-pq="media-uploading"/);
    assert.match(source, /uppy\.on\('upload-progress', progress\)/);
    assert.match(source, /uppy\.off\('upload-progress', progress\)/);
    assert.equal(source.match(/<UploadingTile\s+key=\{upload\.id\}/g)?.length, 2);
    // The empty state waits for uploads too, and the tiles clear once the
    // list has been refetched, not before.
    assert.match(source, /visibleMedia\.length === 0 && uploads\.length === 0/);
    assert.match(source, /await mutate\(\);\n\s+setUploads\(\[\]\)/);
    // A video tile draws its saved poster instead of a grey frame.
    assert.match(source, /poster=\{media\.thumbnail \? mediaDirectory\.set\(media\.thumbnail\) : undefined\}/);
  });

  it('lets a file on its way in be cancelled from its tile, in both grids', () => {
    assert.match(source, /aria-label=\{t\('cancel_upload', 'Cancel upload'\)\}/);
    assert.match(source, /\(id: string\) => \(\) => uppy\.removeFile\(id\)/);
    assert.equal(source.split('onCancel={cancelUpload(upload.id)}').length - 1, 2);
    // Once the server has answered there is no request left to abort.
    assert.match(source, /!upload\.processing && upload\.percent < 100 && \(/);
    // The last running upload gone ends it there and then, and the empty
    // `complete` that follows cannot clear an upload started since.
    assert.match(
      uploader,
      /on\('file-removed', \(\) => \{\n\s+if \(Object\.keys\(uppy2\.getState\(\)\.currentUploads\)\.length > 0\) \{\n\s+return;\n\s+\}\n\s+setLocked\(false\);\n\s+props\.onEnd\(\);/,
    );
    assert.match(
      uploader,
      /on\('complete', async \(result\) => \{\n(\s+\/\/.*\n)+\s+if \(!result\.successful\?\.length && !result\.failed\?\.length\) \{\n\s+return;/,
    );
  });

  it('lets the composer picker fill two full square rows instead of a 264px cap', () => {
    assert.match(source, /MEDIA_LIBRARY_PICKER_HEIGHT = 'min\(760px, 86vh\)'/);
    assert.match(source, /MEDIA_LIBRARY_TWO_ROW_MIN = 'min\(348px,42vh\)'/);
    assert.match(source, /minHeight: MEDIA_LIBRARY_TWO_ROW_MIN/);
    assert.match(source, /flex h-full min-h-0 w-full flex-col/);
    assert.doesNotMatch(source, /max-h-\[min\(380px,48vh\)\]/);
    assert.doesNotMatch(source, /max-h-\[min\(264px,28vh\)\]/);
    assert.doesNotMatch(source, /visibleMedia\.length > 8/);
  });

  it('paints pick order as a brand chip with on-brand digits', () => {
    assert.match(source, /data-pq="media-pick-order"/);
    assert.match(source, /bg-pqBrand text-pqOnBrand/);
    assert.match(source, /selectionOrder \+ 1/);
    assert.doesNotMatch(
      source,
      /min-w-\[22px\].*bg-pqInner.*text-pqBrand/,
    );
  });

  it('keeps the standalone page below the app header', () => {
    assert.match(
      source,
      /standalone[\s\S]{0,400}px-\[22px\] pt-\[22px\] pb-\[28px\]/,
    );
    assert.doesNotMatch(
      source,
      /standalone[\s\S]{0,400}px-\[22px\] pt-\[8px\]/,
    );
  });
});
