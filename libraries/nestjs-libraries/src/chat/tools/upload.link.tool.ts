import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import {
  joinBaseUrl,
  mcpOAuthBaseUrl,
} from '@gitroom/nestjs-libraries/chat/oauth-types';

// For agents that run commands on the user's computer (Codex, Claude Code):
// the upload widget's own ticket and route, handed to the model on purpose, so
// a local file goes in with one curl and no CLI sign-in. The ticket only
// uploads into this organization's media library, and expires with the widget
// ticket's 10 minutes.
@Injectable()
export class UploadLinkTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'uploadLinkTool';
  mcpOnly = true;

  run() {
    return createTool({
      id: 'uploadLinkTool',
      description: `Get a short-lived link to upload files from the user's computer with a command, for agents that can run commands there (such as Codex or Claude Code). Use it when the user wants local files in a post and no upload widget appears; it needs no PostQueen CLI.
Upload each file with one multipart POST to uploadUrl, the file in a field named "file": curl -sS -F "file=@/path/to/picture.png" "<uploadUrl>". The answer is the stored media: attach its id and path to the post.
A video can answer with the status "processing": call uploadWidgetStatusTool with the sessionId until it is "ready", and attach the path it gives then.
The link takes any number of files for about 10 minutes; after that, call this tool again. Anyone holding the link can upload into this workspace until it expires, so never put it in a post or show it publicly.`,
      mcp: {
        annotations: {
          title: 'Upload Link For Local Files',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({}),
      outputSchema: z.object({
        uploadUrl: z.string().optional(),
        sessionId: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        try {
          const org = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          );
          const sessionId = await this._mediaService.createUploadSession(
            org.id
          );
          const ticket = await this._mediaService.createUploadTicket(
            org.id,
            sessionId
          );
          return {
            uploadUrl: `${joinBaseUrl(
              mcpOAuthBaseUrl(),
              '/media-widget/upload'
            )}?ticket=${encodeURIComponent(ticket)}`,
            sessionId,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: `Failed to create an upload link: ${message}` };
        }
      },
    });
  }
}
