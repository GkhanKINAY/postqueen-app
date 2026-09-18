import { Observable } from 'rxjs';
import type { CopilotRuntime } from '@copilotkit/runtime';
import type { MastraDBMessage } from '@mastra/core/agent/message-list';

/**
 * The CopilotKit runtime replays a thread's history from the runner's
 * `connect()`. Its in-memory runner keeps that history in process memory, so
 * a backend restart, a second instance, or the store's own eviction emptied
 * every reopened chat. Mastra already persists the messages (the same
 * `mastra_messages` table `/copilot/:thread/list` reads), so this runner
 * delegates live runs to the in-memory runner and answers `connect()` from
 * Mastra memory instead, converting stored messages into the AG-UI messages
 * the client keeps.
 *
 * `@copilotkit/runtime/v2` ships no root type entry the backend's
 * `moduleResolution: node` can see, so the class comes in through `require`
 * (same as `@sentry/profiling-node` in initialize.sentry.ts) behind the
 * runner type the runtime constructor already declares.
 */
type AgentRunner = NonNullable<
  NonNullable<ConstructorParameters<typeof CopilotRuntime>[0]>['runner']
>;

type ConnectRequest = Parameters<AgentRunner['connect']>[0];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { InMemoryAgentRunner } = require('@copilotkit/runtime/v2') as {
  InMemoryAgentRunner: new () => AgentRunner;
};

/** Message shape the AG-UI client keeps (text, tool calls, tool results). */
export type AgUiMessage =
  | { id: string; role: 'user'; content: string }
  | {
      id: string;
      role: 'assistant';
      content: string;
      toolCalls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { id: string; role: 'tool'; toolCallId: string; content: string };

/** Same suffix `@ag-ui/mastra` gives text that follows a tool call. */
export const AGUI_TEXT_CONTINUATION = '-agui-text';

const asJson = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

/**
 * Stored Mastra messages -> AG-UI messages, in the order the live stream
 * produces them: the assistant text and its tool calls, then one tool
 * message per finished call, then any text that followed the calls under the
 * bridge's continuation id. Ids are kept, so the bridge's new-message diff
 * still recognises the history and does not re-send it.
 */
export const mastraToAgUiMessages = (
  stored: Pick<MastraDBMessage, 'id' | 'role' | 'content'>[]
): AgUiMessage[] => {
  const out: AgUiMessage[] = [];
  for (const message of stored) {
    const parts = Array.isArray(message.content?.parts)
      ? message.content.parts
      : [];
    if (message.role === 'user') {
      const text = parts
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('');
      out.push({
        id: message.id,
        role: 'user',
        content: text || message.content?.content || '',
      });
      continue;
    }
    if (message.role !== 'assistant') {
      continue;
    }
    const head: Extract<AgUiMessage, { role: 'assistant' }> = {
      id: message.id,
      role: 'assistant',
      content: '',
    };
    const results: AgUiMessage[] = [];
    let tail = '';
    for (const part of parts) {
      if (part.type === 'text') {
        if (head.toolCalls?.length) {
          tail += part.text;
        } else {
          head.content += part.text;
        }
        continue;
      }
      if (part.type !== 'tool-invocation') {
        continue;
      }
      const invocation = part.toolInvocation;
      head.toolCalls = head.toolCalls || [];
      head.toolCalls.push({
        id: invocation.toolCallId,
        type: 'function',
        function: {
          name: invocation.toolName,
          arguments: asJson(invocation.args),
        },
      });
      if ('result' in invocation && invocation.result !== undefined) {
        results.push({
          id: `${invocation.toolCallId}-result`,
          role: 'tool',
          toolCallId: invocation.toolCallId,
          content: asJson(invocation.result),
        });
      }
    }
    if (head.content || head.toolCalls?.length) {
      out.push(head);
    }
    out.push(...results);
    if (tail) {
      out.push({
        id: `${message.id}${AGUI_TEXT_CONTINUATION}`,
        role: 'assistant',
        content: tail,
      });
    }
  }
  return out;
};

export type ThreadHistory = {
  /** null when the thread does not exist or belongs to someone else. */
  load: (threadId: string) => Promise<AgUiMessage[] | null>;
};

/**
 * Runs and stop/isRunning go to the in-memory runner, which also serves a
 * connect while a run is in flight (it is the only place the live events
 * are). Every other connect is answered from Mastra memory.
 */
export class MastraThreadRunner implements AgentRunner {
  private readonly _inner: AgentRunner = new InMemoryAgentRunner();

  constructor(private _history: ThreadHistory) {}

  run(
    request: Parameters<AgentRunner['run']>[0]
  ): ReturnType<AgentRunner['run']> {
    return this._inner.run(request);
  }

  isRunning(
    request: Parameters<AgentRunner['isRunning']>[0]
  ): ReturnType<AgentRunner['isRunning']> {
    return this._inner.isRunning(request);
  }

  stop(
    request: Parameters<AgentRunner['stop']>[0]
  ): ReturnType<AgentRunner['stop']> {
    return this._inner.stop(request);
  }

  connect(request: ConnectRequest): ReturnType<AgentRunner['connect']> {
    // The runtime bundles its own rxjs; it only ever calls `subscribe` on
    // what a runner returns, so this instance's Observable is interchangeable
    // at runtime and only the nominal type needs bridging.
    return new Observable((subscriber) => {
      let inner: { unsubscribe: () => void } | undefined;
      (async () => {
        if (await this._inner.isRunning({ threadId: request.threadId })) {
          inner = this._inner.connect(request).subscribe(subscriber);
          return;
        }
        const messages = await this._history.load(request.threadId);
        if (messages?.length) {
          const runId = `${request.threadId}-history`;
          subscriber.next({
            type: 'RUN_STARTED',
            threadId: request.threadId,
            runId,
          } as never);
          subscriber.next({ type: 'MESSAGES_SNAPSHOT', messages } as never);
          subscriber.next({
            type: 'RUN_FINISHED',
            threadId: request.threadId,
            runId,
          } as never);
        }
        subscriber.complete();
      })().catch((err) => subscriber.error(err));
      return () => inner?.unsubscribe();
    }) as unknown as ReturnType<AgentRunner['connect']>;
  }
}
