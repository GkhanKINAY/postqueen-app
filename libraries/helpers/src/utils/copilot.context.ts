/**
 * What the app's two Copilot surfaces send the agent, and what they keep.
 *
 * The frontend puts this on every CopilotKit request (`properties.pq`, read
 * by `/copilot/agent` as `forwardedProps.pq`) and the prompt in
 * chat/load.tools.service.ts prints it under "Current state". Both sides
 * import from here so a renamed key cannot silently drop a section.
 */

/** Which app surface is talking: the Copilot page or Create Post. MCP sends none. */
export type CopilotSurface = 'agent' | 'composer';

/** A channel the app selected, as `properties.pq.channels` sends it. */
export type CopilotChannel = {
  id: string;
  platform: string;
  name?: string;
  handle?: string;
  format?: string;
  customer?: string;
};

export type CopilotProperties = {
  surface: CopilotSurface;
  channels: CopilotChannel[];
  timezone: string;
  locale: string;
};

/**
 * `useCopilotReadable` descriptions the prompt prints. The SDK forwards every
 * readable as `{description, value}`; the server prints only these four and
 * ignores the rest.
 */
export const COPILOT_READABLE = {
  cards: 'Post Preview cards in this chat',
  posts: 'Current content of posts',
  channel: 'Composer channel',
  delays: 'Comment delays',
} as const;

/**
 * The composer's Copilot thread, kept on the post's provider `settings` JSON
 * (same trick as `pq_notify`, no schema change) so a draft opened again shows
 * the chat and the cards it was written with. Only written once the chat was
 * used, never for Sets or the standalone JSON mode.
 */
export const PQ_AI_THREAD_SETTING = 'pq_ai_thread';
