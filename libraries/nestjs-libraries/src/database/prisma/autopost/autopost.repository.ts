import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';

@Injectable()
export class AutopostRepository {
  constructor(private _autoPost: PrismaRepository<'autoPost'>) {}

  getTotal(orgId: string) {
    return this._autoPost.model.autoPost.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  getAutoposts(orgId: string) {
    return this._autoPost.model.autoPost.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  // Prisma raises P2025 when the `where` matches nothing and nothing catches
  // it, so an unknown or foreign id used to answer 500 instead of 404.
  async deleteAutopost(orgId: string, id: string) {
    const { count } = await this._autoPost.model.autoPost.updateMany({
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
      throw new NotFoundException('Autopost not found');
    }
    return { id };
  }

  // An update must update. createAutopost upserts, so a PUT with an id that
  // does not resolve silently created a brand-new rule — and PUT carries no
  // quota policy, so that was a free bypass.
  async assertAutopostExists(orgId: string, id: string) {
    const found = await this._autoPost.model.autoPost.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Autopost not found');
    }
  }

  getAutopost(id: string) {
    return this._autoPost.model.autoPost.findUnique({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  updateUrl(id: string, url: string) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
      },
      data: {
        lastUrl: url,
      },
    });
  }

  changeActive(orgId: string, id: string, active: boolean) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        active,
      },
    });
  }

  async createAutopost(orgId: string, body: AutopostDto, id?: string) {
    const { id: newId, active } = await this._autoPost.model.autoPost.upsert({
      where: {
        id: id || uuidv4(),
        organizationId: orgId,
      },
      create: {
        organizationId: orgId,
        url: body.url,
        title: body.title,
        integrations: JSON.stringify(body.integrations),
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        onSlot: body.onSlot,
        // The DTO marks lastUrl optional but the column is NOT NULL, so an
        // omitted value used to fail the whole insert.
        lastUrl: body.lastUrl || '',
        autoPublish: body.autoPublish ?? false,
      },
      update: {
        url: body.url,
        title: body.title,
        integrations: JSON.stringify(body.integrations),
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        onSlot: body.onSlot,
        // Both are optional in the DTO, and on an UPDATE Prisma reads an
        // omitted key as "leave the column alone" — which is the behaviour we
        // need. Defaulting them here instead reset lastUrl to '' on every PUT,
        // which reopens the `load.url === lastUrl` gate in startAutopost and
        // republishes the item that just went out; and it silently switched
        // auto-publish back off for any client that does not send the field.
        ...(body.lastUrl !== undefined ? { lastUrl: body.lastUrl } : {}),
        ...(body.autoPublish !== undefined
          ? { autoPublish: body.autoPublish }
          : {}),
      },
    });

    return { id: newId, active };
  }
}
