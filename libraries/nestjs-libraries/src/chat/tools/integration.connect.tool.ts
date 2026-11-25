import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class IntegrationConnectTool implements AgentToolInterface {
  constructor(
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager
  ) {}
  name = 'integrationConnectTool';

  run() {
    return createTool({
      id: 'integrationConnectTool',
      mcp: {
        annotations: {
          title: 'Connect Channel',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      description: `
Use this when the user wants to add (connect) a new social media channel to PostQueen: an account, a profile, a page or a business page, for example a Facebook Page, a LinkedIn Page or a Google Business Profile.
It returns the URL of a PostQueen page. The user opens it in a browser, reads what connecting the channel means, and continues to the platform to sign in and approve the access.
The channel is added only after the user completes that page, and is listed by integrationList afterwards. The URL works for one hour.
With a redirectUrl, the confirmation shown once the channel is connected offers a button to that address, and the PostQueen page names that website before the user continues. Without it, a user who is signed in to PostQueen lands on their Channels page, and anyone else sees a confirmation that the channel is connected.
It cannot reconnect or refresh an existing channel. Platforms that need an API key, an instance URL, a wallet or the browser extension are added from the PostQueen app instead.
The workspace's plan is checked when the user continues from the page: if it has no channel left, the page says so and nothing is connected.
If the URL cannot be created, the result contains output.errors explaining why (for example a platform that unlocks when the free trial ends).
`,
      inputSchema: z.object({
        platform: z
          .string()
          .describe(
            `platform identifier (${this._integrationManager
              .getLinkableSocialsIntegrations()
              .join(', ')})`
          ),
        redirectUrl: z
          .string()
          .max(2048)
          .optional()
          .describe(
            'An absolute http(s) URL, without a #fragment, offered as a button once the channel is connected, with "added" (the platform identifier), "focus" (the id of the new channel) and "msg" (a short status text) added to its query string. Use it only when the user or the application they are in gave an address to return to.'
          ),
      }),
      outputSchema: z.object({
        output: z
          .object({
            url: z.string(),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        // The whole organization: whether it is trialing decides which
        // platforms can be linked yet
        const organization = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );

        try {
          return {
            output: await this._integrationService.createConnectLink(
              organization,
              inputData.platform,
              inputData.redirectUrl
            ),
          };
        } catch (err) {
          // a platform that cannot be connected with a link (or not during
          // the trial), or a redirect URL that is refused
          if (err instanceof HttpException) {
            return { output: { errors: err.message } };
          }
          throw err;
        }
      },
    });
  }
}
