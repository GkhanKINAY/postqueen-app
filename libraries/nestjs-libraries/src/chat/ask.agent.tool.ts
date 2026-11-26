import type { Agent, AgentExecutionOptionsBase } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/di';
import { createTool } from '@mastra/core/tools';

/**
 * The agent as one MCP tool, `ask_<key>`. MCPServer's `agents` option builds
 * this same tool, but it answers with everything generate() returned: every
 * step's request and response (the system prompt and the tool definitions
 * among them), the messages and the usage, many times the answer itself.
 * This one keeps what clients see of it (name, description, input) and what
 * the agent is given (the request context with the MCP request's `extra`
 * copied in, `authInfo` among it, and the rest of the tool's context), and
 * answers with the reply alone. An error still throws, which the server
 * turns into an error result, but with its message only: an error from the
 * model loop carries its stack, server file paths included, into that result.
 */
export const askAgentTool = (key: string, agent: Agent) =>
  createTool({
    id: `ask_${key}`,
    description: `Ask agent '${agent.name}' a question. Agent description: ${agent.getDescription()}`,
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The question or input for the agent.',
        },
      },
      required: ['message'],
      additionalProperties: false,
    },
    execute: async (inputData, context) => {
      const requestContext = context?.requestContext || new RequestContext();
      Object.entries(context?.mcp?.extra || {}).forEach(([name, value]) => {
        requestContext.set(name as never, value as never);
      });
      const result = await agent
        .generate(
          (inputData as { message: string }).message,
          { ...context, requestContext } as AgentExecutionOptionsBase<unknown>
        )
        .catch((err: unknown) => {
          // the message only, never the stack the error result would carry
          throw new Error(err instanceof Error ? err.message : String(err));
        });
      // Each step's text, apart: Mastra's `text` runs them together
      const text = result.steps?.length
        ? result.steps
            .map((step) => step.text?.trim())
            .filter(Boolean)
            .join('\n\n')
        : result.text;
      // A run stopped on a tool call (the step cap, or the credits floor
      // reached mid-run) has not answered yet, whatever it wrote before
      if (result.finishReason === 'tool-calls' || !text) {
        const stopped = `The agent stopped before it finished its answer (finish reason: ${result.finishReason}). Actions it took may already have run, so check them before asking again.`;
        return text ? `${text}\n\n${stopped}` : stopped;
      }
      return text;
    },
  });
