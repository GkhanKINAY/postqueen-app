import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { uniq } from 'lodash';

@Injectable()
export class GenerateVideoTool implements AgentToolInterface {
  constructor(
    private _mediaService: MediaService,
    private _videoManager: VideoManager
  ) {}
  name = 'generateVideoTool';

  run() {
    return createTool({
      id: 'generateVideoTool',
      mcp: {
        annotations: {
          title: 'Generate Video',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      description: `Start generating a video for a post. Call generateVideoOptions first for the identifiers and the customParams each generator needs; when a generator lists tools, get those values with videoFunctionTool.
                    Generating takes minutes and uses one video credit, so this only starts the job and returns a jobId.
                    In the PostQueen app the chat shows the job as a card that waits for the result: reply with one short sentence (never the job id) and stop; do not poll.
                    Over MCP or an API client, poll videoStatusTool with the jobId until the status is completed to get the video url.
                    Available generators:
                    ${this._videoManager
                      .getAllVideos()
                      .map((p) => `- ${p.identifier}: ${p.title}`)
                      .join('\n')}
      `,
      inputSchema: z.object({
        identifier: z
          .string()
          .describe('The generator identifier from generateVideoOptions'),
        output: z
          .enum(['vertical', 'horizontal'])
          .describe(
            'vertical for Reels, Stories, TikTok and Shorts; horizontal for X, LinkedIn, YouTube and Facebook'
          ),
        customParams: z.array(
          z.object({
            key: z.string().describe('Name of the settings key to pass'),
            value: z.any().describe('Value of the key'),
          })
        ),
      }),
      outputSchema: z.object({
        jobId: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse((context?.requestContext as any)?.get('organization') as string);
        // Checked here as well as in the service, whose 404 names only the
        // identifier that does not exist: this answer names the ones that do,
        // so the caller can fix the call instead of retrying it.
        const identifiers = this._videoManager
          .getAllVideos()
          .map((p) => p.identifier);
        if (!identifiers.includes(inputData.identifier)) {
          return {
            error: identifiers.length
              ? `There is no video generator "${inputData.identifier}". Use one of these identifiers: ${identifiers.join(', ')}. The user's video credit was not used.`
              : `No video generator is configured on this installation. The user's video credit was not used.`,
          };
        }
        try {
          const value = await this._mediaService.startGenerateVideo(org, {
            type: inputData.identifier,
            output: inputData.output,
            customParams: inputData.customParams.reduce(
              (all: Record<string, any>, current: { key: string; value: any }) => ({
                ...all,
                [current.key]: current.value,
              }),
              {} as Record<string, any>
            ),
          });

          return {
            jobId: value.jobId,
          };
        } catch (err) {
          // SubscriptionException (402) carries { section, action } and its
          // message is just "Subscription Exception", so translate it.
          // A customParams check that fails is a BadRequestException whose
          // message is just "Bad Request Exception"; what is wrong is the
          // list under `message` in its response.
          const invalid =
            err instanceof HttpException
              ? (err.getResponse() as { message?: unknown })?.message
              : undefined;
          const message =
            err instanceof HttpException && err.getStatus() === 402
              ? 'No AI video credits are available on this account.'
              : Array.isArray(invalid)
              ? `customParams are not valid: ${uniq(invalid).join('; ')}`
              : err instanceof Error
              ? err.message
              : String(err);
          return {
            // The reason may end in its own period; the sentence adds one.
            error: `Video generation failed: ${message.replace(
              /\.+$/,
              ''
            )}. The user's video credit was not used.`,
          };
        }
      },
    });
  }
}
