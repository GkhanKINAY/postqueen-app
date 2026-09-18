import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';

@Injectable()
export class GenerateImageTool implements AgentToolInterface {
  constructor(
    private _mediaService: MediaService,
    private _subscriptionService: SubscriptionService
  ) {}
  name = 'generateImageTool';

  run() {
    return createTool({
      id: 'generateImageTool',
      description: `Generate an image for a post and put it in the media library; the result { id, path } is the attachment to use.
                    If a platform needs an attachment and none was given, ask once whether the user wants a picture or a video.
                    Write the prompt as a visual brief (subject, setting, composition, light, mood), not as a caption; it is expanded into a full render prompt before generating.
                    Pick the orientation from where the image will be posted: portrait for stories, reels, TikTok and Pinterest; square for feeds; landscape for X and LinkedIn link-style posts.
      `,
      mcp: {
        annotations: {
          title: 'Generate Image',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        prompt: z.string().describe('What to draw, as a visual brief'),
        style: z
          .string()
          .optional()
          .describe(
            'Optional look: Realistic, Cartoon, Anime, Minimalist, Sketch, Watercolor. Realistic when omitted.'
          ),
        orientation: z
          .enum(['square', 'portrait', 'landscape'])
          .optional()
          .describe('Square (1:1) when omitted'),
      }),
      // Mastra validates the return against this schema, so it must also
      // allow the graceful { error } shape (same as uploadFromUrlTool)
      outputSchema: z.object({
        id: z.string().optional(),
        path: z.string().optional(),
        alt: z.string().nullable().optional(),
        thumbnail: z.string().nullable().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse((context?.requestContext as any)?.get('organization') as string);
        try {
          // Same credit gate as the dashboard's /media/generate-image route -
          // only enforced when billing is enabled (cloud), self-hosted is free
          const total = await this._subscriptionService.checkCredits(org);
          if (isBillingEnabled() && total.credits <= 0) {
            return {
              error: 'No AI image credits are available on this account.',
            };
          }

          // The same envelope and prompt expansion as the dashboard's AI
          // Image (media.controller.ts /generate-image-with-prompt): a short
          // brief becomes a full render prompt before the image is drawn.
          return await this._mediaService.generateImageToLibrary(
            org,
            `
<!-- description -->
${inputData.prompt}
<!-- /description -->

<!-- style -->
${inputData.style || 'Realistic'}
<!-- /style -->
`,
            inputData.orientation
          );
        } catch (err) {
          return {
            error: `Image generation failed: ${
              err instanceof Error ? err.message : String(err)
            }. The user's image credit was not used.`,
          };
        }
      },
    });
  }
}
