import {
  AgentToolInterface,
} from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { getValidationSchemas } from '@gitroom/nestjs-libraries/chat/validation.schemas.helper';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class GenerateVideoOptionsTool implements AgentToolInterface {
  constructor(private _videoManagerService: VideoManager) {}
  name = 'generateVideoOptions';

  run() {
    return createTool({
      id: 'generateVideoOptions',
      description: `The video generators this installation can use, with the identifier generateVideoTool takes, what each one makes, whether a trial account may use it, and the customParams it needs (a JSON schema).
                    When a generator lists tools, call videoFunctionTool with that identifier and functionName first to get the value the schema asks for (a voice id, for example).
                    Call this before generateVideoTool; an empty list means no video generator is configured and the user should be told so.`,
      inputSchema: z.object({
        reasoning: z
          .string()
          .optional()
          .describe(
            'Optional short reason for why you are listing the video generation options'
          ),
      }),
      mcp: {
        annotations: {
          title: 'List Video Generation Options',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        video: z.array(
          z.object({
            identifier: z.string(),
            title: z.string(),
            description: z.string(),
            trial: z.boolean(),
            output: z.string(),
            tools: z.array(
              z.object({
                functionName: z.string(),
                output: z.string(),
              })
            ),
            customParams: z.any(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const videos = this._videoManagerService.getAllVideos();
        return {
          video: videos.map((p) => ({
            identifier: p.identifier,
            title: p.title,
            description: p.description,
            trial: p.trial,
            output: 'vertical|horizontal',
            tools: p.tools,
            customParams: getValidationSchemas()[p.dto.name],
          })),
        };
      },
    });
  }
}
