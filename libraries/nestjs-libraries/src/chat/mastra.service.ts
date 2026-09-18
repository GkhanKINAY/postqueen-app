import { Mastra } from '@mastra/core/mastra';
import { ConsoleLogger } from '@mastra/core/logger';
import { pStore } from '@gitroom/nestjs-libraries/chat/mastra.store';
import { BadRequestException, Injectable } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import {
  MastraThreadRunner,
  mastraToAgUiMessages,
} from '@gitroom/nestjs-libraries/chat/mastra.thread.runner';

/** Where PostQueen keeps its own per-thread UI state inside thread metadata. */
const THREAD_STATE_KEY = 'pq';
/** Selected channels plus card outcomes; anything bigger is a bug. */
const THREAD_STATE_MAX_BYTES = 16 * 1024;

export type CopilotSurface = 'agent' | 'composer';

@Injectable()
export class MastraService {
  static mastra: Mastra;
  constructor(private _loadToolsService: LoadToolsService) {}
  async mastra() {
    MastraService.mastra =
      MastraService.mastra ||
      new Mastra({
        storage: pStore,
        agents: {
          postqueen: await this._loadToolsService.agent(),
        },
        logger: new ConsoleLogger({
          level: 'info',
        }),
      });

    return MastraService.mastra;
  }

  /**
   * Threads are keyed by resource. The Copilot page uses the organization id;
   * the Create Post rail gets its own namespace so a composer chat never shows
   * up in the page's Chats list, and `/copilot/list` needs no filter.
   */
  resourceId(organizationId: string, surface: CopilotSurface) {
    return surface === 'composer'
      ? `${organizationId}:composer`
      : organizationId;
  }

  private async memory() {
    const mastra = await this.mastra();
    return mastra.getAgent('postqueen').getMemory();
  }

  /** The thread when it exists and belongs to this organization, else null. */
  private async ownedThread(organizationId: string, threadId: string) {
    const memory = await this.memory();
    const thread = await memory.getThreadById({ threadId });
    if (!thread) {
      return null;
    }
    const owners = [
      this.resourceId(organizationId, 'agent'),
      this.resourceId(organizationId, 'composer'),
    ];
    return owners.includes(thread.resourceId) ? thread : undefined;
  }

  /** null: no such thread. undefined: exists, but not this organization's. */
  async threadOwnedBy(organizationId: string, threadId: string) {
    return this.ownedThread(organizationId, threadId);
  }

  /**
   * The runner handed to CopilotKit for one request: live runs stay in
   * memory, reopened threads replay from Mastra memory.
   */
  async threadRunner(organizationId: string) {
    return new MastraThreadRunner({
      load: async (threadId) => {
        const thread = await this.ownedThread(organizationId, threadId);
        if (!thread) {
          return null;
        }
        const memory = await this.memory();
        const { messages } = await memory.recall({
          threadId,
          resourceId: thread.resourceId,
          perPage: false,
        });
        return mastraToAgUiMessages(messages);
      },
    });
  }

  async getThreadState(organizationId: string, threadId: string) {
    const thread = await this.ownedThread(organizationId, threadId);
    const state = thread?.metadata?.[THREAD_STATE_KEY];
    return state && typeof state === 'object'
      ? (state as Record<string, unknown>)
      : {};
  }

  /**
   * Merges a partial state into `metadata.pq`. A thread that has not been
   * written by a run yet is created empty (no title, so Mastra still names
   * it on the first message). Returns null when the thread is someone
   * else's.
   */
  async saveThreadState(
    organizationId: string,
    threadId: string,
    surface: CopilotSurface,
    patch: Record<string, unknown>
  ) {
    const thread = await this.ownedThread(organizationId, threadId);
    if (thread === undefined) {
      return null;
    }
    const current = thread?.metadata?.[THREAD_STATE_KEY];
    const next = {
      ...(current && typeof current === 'object' ? current : {}),
      ...patch,
    } as Record<string, unknown>;
    if (JSON.stringify(next).length > THREAD_STATE_MAX_BYTES) {
      throw new BadRequestException('Thread state is too large.');
    }
    const memory = await this.memory();
    if (!thread) {
      const created = await memory.createThread({
        threadId,
        resourceId: this.resourceId(organizationId, surface),
        metadata: { [THREAD_STATE_KEY]: next },
      });
      return created.metadata?.[THREAD_STATE_KEY] as Record<string, unknown>;
    }
    const updated = await memory.updateThread({
      id: thread.id,
      title: thread.title || '',
      metadata: { ...(thread.metadata || {}), [THREAD_STATE_KEY]: next },
    });
    return updated.metadata?.[THREAD_STATE_KEY] as Record<string, unknown>;
  }
}
