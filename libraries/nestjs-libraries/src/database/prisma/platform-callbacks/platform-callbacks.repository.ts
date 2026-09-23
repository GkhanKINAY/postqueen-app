import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PlatformCallbacksRepository {
  constructor(
    private _deletionRequest: PrismaRepository<'platformDeletionRequest'>
  ) {}

  createDeletionRequest(data: {
    provider: string;
    platformUserHash: string;
    confirmationCode: string;
    channels: number;
  }) {
    return this._deletionRequest.model.platformDeletionRequest.create({
      data,
    });
  }

  completeDeletionRequest(id: string) {
    return this._deletionRequest.model.platformDeletionRequest.update({
      where: { id },
      data: { completedAt: new Date() },
    });
  }

  // Public by confirmation code, so it answers with the status only.
  getDeletionRequest(confirmationCode: string) {
    return this._deletionRequest.model.platformDeletionRequest.findUnique({
      where: { confirmationCode },
      select: {
        confirmationCode: true,
        channels: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }
}
