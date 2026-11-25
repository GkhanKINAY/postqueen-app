import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class IntegrationAnalyticsTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'integrationAnalyticsTool';

  run() {
    return createTool({
      id: 'integrationAnalyticsTool',
      mcp: {
        annotations: {
          title: 'Channel Analytics',
          // It can refresh the channel's token, but changes no user data
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      description: `
Get the analytics of one channel (integration) over the last days, for example followers, impressions and engagement per day (the same data as Analytics → a channel in the app, and the "Channel Analytics" API endpoint).
This is about the channel as a whole. For the numbers of published posts use analyticsSummaryTool, analyticsPostsTool or analyticsPostTool instead.
Pass the channel "id" from the integrationList tool.
The metrics differ per platform - each one has a "label" and a list of data points.
The data is loaded from the platform and kept for up to an hour, so calling again within the hour returns the same numbers.
A platform that bills every read (X) is never read by this tool: it returns what the last Refresh in the app's Analytics loaded, for that platform's own window, and an empty list until someone presses it.
An empty list can also mean the platform has no analytics or returned nothing for this period.
If the channel is not found or has to be reconnected, the result contains output.errors.
`,
      inputSchema: z.object({
        id: z.string().describe('The "id" of the channel (integration)'),
        days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .describe(
            'How many days back to load, for example 7, 30 or 90. Defaults to 7'
          ),
      }),
      outputSchema: z.object({
        output: z
          .object({
            analytics: z.array(
              z.object({
                label: z.string().describe('The metric name'),
                percentageChange: z.number(),
                data: z.array(
                  z.object({
                    total: z.string(),
                    date: z.string(),
                  })
                ),
              })
            ),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );

        try {
          // The page view's read, never Refresh's (readManualOnly): this is
          // what keeps a provider that bills every read out of reach here
          const analytics = await this._integrationService.checkAnalytics(
            org,
            inputData.id,
            String(inputData.days || 7)
          );

          return {
            output: {
              analytics: (analytics || []).map((p) => ({
                label: p.label || '',
                percentageChange: p.percentageChange || 0,
                data: (p.data || []).map((d) => ({
                  total: String(d.total ?? ''),
                  date: String(d.date),
                })),
              })),
            },
          };
        } catch (err: any) {
          return { output: { errors: err?.message || 'Channel not found' } };
        }
      },
    });
  }
}
