import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WebhooksDto } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WebhooksRepository {
  constructor(
    private _webhooks: PrismaRepository<'webhooks'>,
    private _integration: PrismaRepository<'integration'>
  ) {}

  getTotal(orgId: string) {
    return this._webhooks.model.webhooks.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  getWebhooks(orgId: string) {
    return this._webhooks.model.webhooks.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
      include: {
        integrations: {
          select: {
            integration: {
              select: {
                id: true,
                picture: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  // Both of these used to surface as a 500: Prisma raises P2025 for a `where`
  // that matches nothing, and nothing catches it.
  async deleteWebhook(orgId: string, id: string) {
    const { count } = await this._webhooks.model.webhooks.updateMany({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
    if (!count) {
      throw new NotFoundException('Webhook not found');
    }
    return { id };
  }

  // An update must update. createWebhook upserts on a body-supplied id, so a
  // PUT carrying an id that does not resolve silently minted a brand-new row
  // with a fresh uuid — the quota is only enforced on POST, so that was a free
  // bypass. Prove the row exists first.
  async assertWebhookExists(orgId: string, id: string) {
    const found = await this._webhooks.model.webhooks.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Webhook not found');
    }
  }

  async createWebhook(orgId: string, body: WebhooksDto) {
    // Resolved BEFORE the upsert. The ids come straight from the request body;
    // attaching another organization's integration would read its channel name
    // and picture back out through getWebhooks(), so keep only the ones this
    // organization owns.
    const owned = await this._integration.model.integration.findMany({
      where: {
        organizationId: orgId,
        // Soft-deleted channels still resolve without this, so the guard below
        // never fired for the case it names, and the upsert happily re-created
        // join rows for channels the user had removed — getWebhooks then reads
        // them back with name and picture.
        deletedAt: null,
        id: { in: body.integrations.map((integration) => integration.id) },
      },
      select: { id: true },
    });

    // Zero integrations means "fire for every channel" at delivery time
    // (post.activity sendWebhooks). If the caller asked for specific channels
    // and none of them resolved — all deleted, or ids from another org —
    // writing the empty list would silently widen a scoped webhook into a
    // firehose. Refuse before anything is written.
    if (body.integrations.length && !owned.length) {
      throw new BadRequestException(
        'None of the selected channels are available anymore'
      );
    }

    const { id } = await this._webhooks.model.webhooks.upsert({
      where: {
        id: body.id || uuidv4(),
        organizationId: orgId,
      },
      create: {
        organizationId: orgId,
        url: body.url,
        name: body.name,
      },
      update: {
        url: body.url,
        name: body.name,
      },
    });

    await this._webhooks.model.webhooks.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        integrations: {
          deleteMany: {},
          create: owned.map((integration) => ({
            integrationId: integration.id,
          })),
        },
      },
    });

    return { id };
  }
}
