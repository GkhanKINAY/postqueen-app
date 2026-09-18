import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

@Injectable()
export class PostReadTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postReadTool';

  run() {
    return createTool({
      id: 'postReadTool',
      mcp: {
        annotations: {
          title: 'Read Post',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `
One existing post in full: its thread (the post, then its comments or thread items, each with its own id, content, media and delay in minutes), its channel, state, publish date (UTC) and provider settings.
Use it with an id from postsListTool before changing, rescheduling or showing an existing post; the ids of the thread items are what an update needs.
`,
      inputSchema: z.object({
        id: z.string().describe('The post id from postsListTool (the first item of a thread)'),
      }),
      outputSchema: z.object({
        output: z
          .object({
            id: z.string(),
            group: z.string(),
            integrationId: z.string(),
            platform: z.string().optional(),
            integrationName: z.string().optional(),
            state: z.string().describe('QUEUE, DRAFT, PUBLISHED or ERROR'),
            publishDate: z.string().describe('UTC time'),
            settings: z.any(),
            posts: z.array(
              z.object({
                id: z.string(),
                content: z.string(),
                delay: z.number().describe('Minutes after the previous item'),
                attachments: z.array(
                  z.object({ id: z.string(), path: z.string() })
                ),
              })
            ),
          })
          .optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;
        try {
          const post = await this._postsService.getPost(organizationId, inputData.id);
          const first: any = post?.posts?.[0];
          if (!first) {
            return { error: 'Post not found' };
          }
          return {
            output: {
              id: first.id,
              group: post.group,
              integrationId: first.integrationId,
              platform: first.integration?.providerIdentifier,
              integrationName: first.integration?.name,
              state: first.state,
              publishDate: dayjs(first.publishDate).utc().format('YYYY-MM-DDTHH:mm:ss'),
              settings: post.settings,
              posts: post.posts.map((p: any) => ({
                id: p.id,
                content: p.content || '',
                delay: p.delay || 0,
                attachments: (Array.isArray(p.image) ? p.image : [])
                  .filter((m: any) => m?.path)
                  .map((m: any) => ({ id: String(m.id || ''), path: String(m.path) })),
              })),
            },
          };
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    });
  }
}
