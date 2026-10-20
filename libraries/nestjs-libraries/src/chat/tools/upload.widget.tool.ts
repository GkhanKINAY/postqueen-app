import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { UPLOAD_WIDGET_URI } from '@gitroom/nestjs-libraries/chat/ui/upload.widget';

@Injectable()
export class UploadWidgetTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'uploadWidgetTool';
  mcpOnly = true;

  run() {
    return createTool({
      id: 'uploadWidgetTool',
      description: `Show the user an upload widget to add images or videos from their own device to the media library.
Use this when the user wants to attach a local file to a post. When the media is already available on a public URL, use uploadFromUrlTool instead; it cannot read local files.
The widget is only displayed by apps that support MCP Apps (interactive UI). Where no widget appears:
- If you can run commands on the user's computer, upload the files yourself with the PostQueen CLI (postqueen upload <file>, https://docs.postqueen.ai/cli/introduction) or the public API (POST /public/v1/upload with an API key, https://docs.postqueen.ai/public-api/introduction).
- Otherwise give the user mediaPageUrl, the Media page of PostQueen, and ask them to upload the files there, in the same workspace as this connection. When they are done, find each file with mediaListTool (search by its file name) and attach the returned { id, path }. A video shows up only once it is converted: if it is missing, wait about 10 seconds and search again.
Returns a sessionId and mediaPageUrl: the files the user uploads in the widget are reported in the conversation, and can also be read with uploadWidgetStatusTool.`,
      mcp: {
        annotations: {
          title: 'Upload Media From Device',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
        _meta: {
          ui: {
            resourceUri: UPLOAD_WIDGET_URI,
          },
        },
      },
      inputSchema: z.object({}),
      outputSchema: z.object({
        sessionId: z.string().optional(),
        mediaPageUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        try {
          const org = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          );
          return {
            sessionId: await this._mediaService.createUploadSession(org.id),
            // where the user uploads when the app shows no widget
            mediaPageUrl: `${process.env.FRONTEND_URL}/media`,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: `Failed to open the upload widget: ${message}` };
        }
      },
    });
  }
}
