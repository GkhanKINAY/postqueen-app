import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { resolve, sep } from 'path';

const CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

async function* nodeStreamToIterator(stream: any) {
  for await (const chunk of stream) {
    yield chunk;
  }
}
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(new Uint8Array(value));
      }
    },
  });
}

/**
 * One `bytes=start-end` range against a file size, or nothing when the
 * header is absent or malformed. A range past the end is the 416 case.
 */
const parseRange = (header: string | null, size: number) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!match || (!match[1] && !match[2])) {
    return undefined;
  }
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return { start, end, satisfiable: start <= end && start < size };
};

export const GET = async (
  request: NextRequest,
  context: {
    params: Promise<{
      path?: string[];
    }>;
  }
) => {
  const { path } = await context.params;
  if (!process.env.UPLOAD_DIRECTORY) {
    return new NextResponse('Not found', { status: 404 });
  }
  const base = resolve(process.env.UPLOAD_DIRECTORY);
  const filePath = resolve(base, (path ?? []).join('/'));
  // Confine reads to UPLOAD_DIRECTORY. resolve() collapses any `..` segments
  // (including URL-decoded ones), so this blocks every path-traversal variant.
  if (filePath !== base && !filePath.startsWith(base + sep)) {
    return new NextResponse('Not found', { status: 404 });
  }
  let fileStats;
  try {
    fileStats = statSync(filePath);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const contentType = CONTENT_TYPE[ext] || 'application/octet-stream';
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Last-Modified': fileStats.mtime.toUTCString(),
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Browsers seek a video by asking for byte ranges; without this they
    // download the whole file to reach the first frame, and a poster capture
    // or a scrub on a self-hosted upload waited on the entire clip.
    'Accept-Ranges': 'bytes',
  };
  const range = parseRange(request.headers.get('range'), fileStats.size);
  if (range && !range.satisfiable) {
    return new NextResponse(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${fileStats.size}` },
    });
  }
  const response = range
    ? createReadStream(filePath, { start: range.start, end: range.end })
    : createReadStream(filePath);
  const iterator = nodeStreamToIterator(response);
  const webStream = iteratorToStream(iterator);
  if (range) {
    return new Response(webStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${fileStats.size}`,
      },
    });
  }
  return new Response(webStream, {
    headers: { ...headers, 'Content-Length': fileStats.size.toString() },
  });
};
