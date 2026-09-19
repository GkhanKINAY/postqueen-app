import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

/** How long the tool waits for a .mov to become an mp4 before answering. */
const MOV_WAIT_MS = 4 * 60 * 1000;

@Injectable()
export class UploadFromUrlTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'uploadFromUrlTool';

  run() {
    return createTool({
      id: 'uploadFromUrlTool',
      description: `Upload a remote image or video into the media library from a public URL.
Use this before scheduling a post when the user provides an external media URL (not already hosted on our domain),
so the attachment passes the upload-domain validation. Returns the hosted media { id, path, status } to use as an attachment, or { error } on failure.
A video is converted for the platforms in the background: an mp4 comes back with status "processing" and can be attached by its id right away; a .mov is waited on until it is an mp4 (status "ready"), because a post takes no .mov.`,
      mcp: {
        annotations: {
          title: 'Upload Media From URL',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        url: z
          .string()
          .url()
          .describe('The public URL of the image or video to upload'),
      }),
      // Mastra validates a tool's return against this schema, so it must also
      // allow the graceful { error } shape. Fields are optional (rather than
      // wrapping everything in an `output` union) to keep the change minimal:
      // the existing { id, path } success return and the new { error } return
      // both validate without rewriting every return statement.
      outputSchema: z.object({
        id: z.string().optional(),
        path: z.string().optional(),
        status: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        try {
          const org = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          );

          // Same path as the public API's /upload-from-url: streamed to a
          // spooled file, sniffed, allow-listed and stored
          const saved = await this._mediaService.uploadFromUrl(
            org.id,
            inputData.url
          );
          if (saved.status !== 'processing' || /\.mp4$/i.test(saved.name)) {
            return saved;
          }
          // A .mov is of no use to a post until the normalizer has made an
          // mp4 of it; wait for that here, within the time a tool call has.
          const deadline = Date.now() + MOV_WAIT_MS;
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const latest = await this._mediaService.getMediaStatus(org.id, saved.id);
            if (latest.status !== 'processing') {
              return latest.status === 'ready'
                ? latest
                : { error: latest.processingError || 'The video could not be converted.' };
            }
          }
          return {
            error: 'The video is still being converted; ask again in a minute with the same URL, or use an mp4.',
          };
        } catch (err) {
          // undici's fetch rejects with a generic TypeError('fetch failed')
          // and hides the real reason (DNS, TLS, SSRF block, ...) in
          // err.cause, which the service wraps once more, so walk the chain
          // and surface it for the agent. Error.cause isn't in the es2020
          // lib typings this repo compiles against, hence the cast
          const message =
            err instanceof Error ? err.message : 'Unexpected error';
          const causes: string[] = [];
          let cause = (err as Error & { cause?: unknown })?.cause;
          while (cause instanceof Error) {
            if (cause.message) {
              causes.push(cause.message);
            }
            cause = (cause as Error & { cause?: unknown }).cause;
          }
          const causeText = causes.length ? ` (${causes.join(': ')})` : '';

          return {
            error: `Failed to upload media from URL: ${message}${causeText}`,
          };
        }
      },
    });
  }
}
