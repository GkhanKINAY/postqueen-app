import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { before, describe, it } from 'node:test';

// Same loader hook as posts/create.post.spec.ts, for the upload code the
// service imports.
const canLoadService = typeof nodeModule.registerHooks === 'function';
if (canLoadService) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) =>
      specifier === 'file-type'
        ? {
            url: new URL(
              '../../../../../../node_modules/file-type/source/index.js',
              import.meta.url
            ).href,
            shortCircuit: true,
          }
        : next(specifier, context),
  });
}

let service: any;
before(async () => {
  if (canLoadService) {
    const { MediaService } = await import('./media.service.ts');
    service = Object.create(MediaService.prototype);
  }
});

const row = (name: string, status: string, processingError?: string) => ({
  id: 'media-1',
  name,
  path: `https://cdn.example/${name}`,
  status,
  processingError: processingError ?? null,
});

describe('What MCP callers see of an upload', { skip: !canLoadService }, () => {
  it('passes processing and ready through', () => {
    assert.deepEqual(service.toUploadStatus(row('a.mp4', 'processing')), {
      id: 'media-1',
      path: 'https://cdn.example/a.mp4',
      status: 'processing',
    });
    assert.deepEqual(service.toUploadStatus(row('a.png', 'ready')), {
      id: 'media-1',
      path: 'https://cdn.example/a.png',
      status: 'ready',
    });
  });

  // failProcessing keeps an mp4 the normalizer gave up on, and publishing
  // uses it as it is
  it('calls a failed mp4 ready, with a warning', () => {
    const status = service.toUploadStatus(row('a.mp4', 'failed', 'ffmpeg exited'));
    assert.equal(status.status, 'ready');
    assert.match(status.warning, /original file was kept/);
    assert.equal(status.error, undefined);
  });

  // and drops a .mov, which no platform takes
  it('keeps a failed .mov failed, with the reason', () => {
    assert.deepEqual(service.toUploadStatus(row('a.mov', 'failed', 'ffmpeg exited')), {
      id: 'media-1',
      path: 'https://cdn.example/a.mov',
      status: 'failed',
      error: 'ffmpeg exited',
    });
  });
});
