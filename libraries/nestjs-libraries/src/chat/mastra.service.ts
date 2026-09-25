import { Mastra } from '@mastra/core/mastra';
import { ConsoleLogger } from '@mastra/core/logger';
import { pStore } from '@gitroom/nestjs-libraries/chat/mastra.store';
import { BadRequestException, Injectable } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import {
  MastraThreadRunner,
  mastraToAgUiMessages,
} from '@gitroom/nestjs-libraries/chat/mastra.thread.runner';
import { ThreadStateDto } from '@gitroom/nestjs-libraries/dtos/copilot/thread.state.dto';
import { CopilotSurface } from '@gitroom/helpers/utils/copilot.context';

/** Where PostQueen keeps its own per-thread UI state inside thread metadata. */
const THREAD_STATE_KEY = 'pq';
/**
 * Selected channels, card outcomes and the attachments put on cards later:
 * a long thread with an image on every card stays well under this; anything
 * bigger is a bug, not a use.
 */
const THREAD_STATE_MAX_BYTES = 64 * 1024;

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

  /**
   * Thread ids are minted by the client, so any id can name a thread that
   * another organization already owns. `thread` is this organization's
   * thread or null; `foreign` says the id is taken by someone else's.
   */
  private async findThread(organizationId: string, threadId: string) {
    const memory = await this.memory();
    const thread = await memory.getThreadById({ threadId });
    const owned =
      !!thread &&
      [
        this.resourceId(organizationId, 'agent'),
        this.resourceId(organizationId, 'composer'),
      ].includes(thread.resourceId);
    return { thread: owned ? thread : null, foreign: !!thread && !owned };
  }

  async isForeignThread(organizationId: string, threadId: string) {
    const { foreign } = await this.findThread(organizationId, threadId);
    return foreign;
  }

  /**
   * The runner handed to CopilotKit for one request: live runs stay in
   * memory, reopened threads replay from Mastra memory.
   */
  async threadRunner(organizationId: string) {
    return new MastraThreadRunner({
      load: async (threadId) => {
        const { thread } = await this.findThread(organizationId, threadId);
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

  /** The Copilot page's chats, newest first. Composer chats live under their own resource and never show here. */
  async listThreads(organizationId: string) {
    const memory = await this.memory();
    const list = await memory.listThreads({
      filter: { resourceId: this.resourceId(organizationId, 'agent') },
      perPage: 100000,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });
    return list.threads.map((p) => ({
      id: p.id,
      title: p.title,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * A page chat of this organization, or null. Rename and delete only ever
   * reach the Chats list's own threads, never a composer chat.
   */
  private async findPageThread(organizationId: string, threadId: string) {
    const { thread } = await this.findThread(organizationId, threadId);
    return thread?.resourceId === this.resourceId(organizationId, 'agent')
      ? thread
      : null;
  }

  /** Runs live in a process-wide store, so any runner instance sees them. */
  private async isRunning(organizationId: string, threadId: string) {
    const runner = await this.threadRunner(organizationId);
    return runner.isRunning({ threadId });
  }

  /**
   * Mastra only names a thread while its title is empty, so a name given
   * here is never overwritten by the next message. Null: not this
   * organization's chat.
   */
  async renameThread(organizationId: string, threadId: string, title: string) {
    const name = title.trim();
    if (!name) {
      throw new BadRequestException('A chat needs a name.');
    }
    const thread = await this.findPageThread(organizationId, threadId);
    if (!thread) {
      return null;
    }
    const memory = await this.memory();
    const updated = await memory.updateThread({
      id: thread.id,
      title: name,
      metadata: thread.metadata || {},
    });
    return { id: updated.id, title: updated.title };
  }

  /**
   * Deletes the transcript and the thread in one go. A chat that is still
   * answering is left alone: the end of its run saves the transcript and
   * would bring the thread back. Posts it scheduled and media it made are
   * not part of the thread and stay.
   */
  async deleteThread(
    organizationId: string,
    threadId: string
  ): Promise<'deleted' | 'missing' | 'running'> {
    const thread = await this.findPageThread(organizationId, threadId);
    if (!thread) {
      return 'missing';
    }
    if (await this.isRunning(organizationId, threadId)) {
      return 'running';
    }
    const memory = await this.memory();
    await memory.deleteThread(thread.id);
    return 'deleted';
  }

  /** Every page chat of the organization, except the ones still answering. */
  async clearThreads(organizationId: string) {
    const threads = await this.listThreads(organizationId);
    const memory = await this.memory();
    let deleted = 0;
    let running = 0;
    for (const thread of threads) {
      if (await this.isRunning(organizationId, thread.id)) {
        running++;
        continue;
      }
      await memory.deleteThread(thread.id);
      deleted++;
    }
    return { deleted, running };
  }

  async getThreadState(organizationId: string, threadId: string) {
    const { thread } = await this.findThread(organizationId, threadId);
    const state = thread?.metadata?.[THREAD_STATE_KEY];
    return state && typeof state === 'object'
      ? (state as Record<string, unknown>)
      : {};
  }

  /**
   * Merges the fields the app keeps into `metadata.pq` (the global
   * ValidationPipe does not whitelist, and this lands in stored metadata).
   * A thread that has not been written by a run yet is created empty (no
   * title, so Mastra still names it on the first message). Returns null when
   * the thread is someone else's.
   */
  async saveThreadState(
    organizationId: string,
    threadId: string,
    body: ThreadStateDto
  ) {
    const { thread, foreign } = await this.findThread(organizationId, threadId);
    if (foreign) {
      return null;
    }
    const surface: CopilotSurface =
      body.surface === 'composer' ? 'composer' : 'agent';
    const patch: Record<string, unknown> = {};
    if (body.channels !== undefined) {
      patch.channels = body.channels;
    }
    if (body.cards !== undefined) {
      patch.cards = body.cards;
    }
    if (body.media !== undefined) {
      patch.media = body.media;
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
