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
          (p) => p.identifier === inputData.identifier
        );

        // "Function not found" answered both mistakes alike and named
        // nothing the caller could use instead.
        if (!findVideo) {
          throw new Error(
            videos.length
              ? `There is no video generator "${inputData.identifier}". Use one of these identifiers: ${videos
                  .map((p) => p.identifier)
                  .join(', ')}.`
              : 'No video generator is configured on this installation.'
          );
        }

        if (
          !findVideo.tools.some(
            (p) => p.functionName === inputData.functionName
          )
        ) {
          throw new Error(
            findVideo.tools.length
              ? `The video generator "${findVideo.identifier}" has no function "${inputData.functionName}". Its functions are: ${findVideo.tools
                  .map((p) => p.functionName)
                  .join(', ')}.`
              : `The video generator "${findVideo.identifier}" has no functions to call.`
          );
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
