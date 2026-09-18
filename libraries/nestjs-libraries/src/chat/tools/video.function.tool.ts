import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import z from 'zod';
import { ModuleRef } from '@nestjs/core';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class VideoFunctionTool implements AgentToolInterface {
  constructor(
    private _videoManagerService: VideoManager,
    private _moduleRef: ModuleRef
  ) {}
  name = 'videoFunctionTool';

  run() {
    return createTool({
      id: 'videoFunctionTool',
      description: `Calls a helper a video generator lists under tools in generateVideoOptions, for a value its customParams need (loadVoices on image-text-slides returns the voice ids, for example). Pass the generator identifier and the functionName as listed.`,
      mcp: {
        annotations: {
          title: 'Video Function Helper',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        identifier: z.string().describe('The generator identifier'),
        functionName: z.string().describe('The functionName from its tools list'),
        params: z
          .string()
          .optional()
          .describe('Arguments for the helper as a JSON string, when it takes any'),
      }),
      outputSchema: z.object({}).passthrough(),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const videos = this._videoManagerService.getAllVideos();
        const findVideo = videos.find(
          (p) =>
            p.identifier === inputData.identifier &&
            p.tools.some((p) => p.functionName === inputData.functionName)
        );

        if (!findVideo) {
          throw new Error('Function not found');
        }

        let params: unknown = {};
        if (inputData.params) {
          try {
            params = JSON.parse(inputData.params);
          } catch {
            throw new Error('params must be a JSON string');
          }
        }
        const func = await this._moduleRef
          // @ts-ignore
          .get(findVideo.target, { strict: false })
          [inputData.functionName](params);
        return func;
      },
    });
  }
}
