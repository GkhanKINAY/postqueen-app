import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { exactEmail } from '@gitroom/helpers/auth/account-security';

/**
 * The proof of a service notice: one NoticeDelivery row per notice and user,
 * with no address in it. The address a row stands for is read through its
 * user, while the account is live.
 */
@Injectable()
export class NoticesRepository {
  constructor(private _noticeDelivery: PrismaRepository<'noticeDelivery'>) {}

  listDeliveries(noticeKey: string) {
    return this._noticeDelivery.model.noticeDelivery.findMany({
      where: { noticeKey },
      select: { userId: true, user: { select: { email: true } } },
    });
  }

  /** This account, or another account at the same address, already has it. */
  async wasDelivered(noticeKey: string, userId: string, email: string) {
    return !!(await this._noticeDelivery.model.noticeDelivery.findFirst({
      where: {
        noticeKey,
        OR: [
          { userId },
          {
            user: {
              email: { equals: exactEmail(email), mode: 'insensitive' },
            },
          },
        ],
      },
      select: { id: true },
    }));
  }

  recordDelivery(noticeKey: string, userId: string) {
    return this._noticeDelivery.model.noticeDelivery.upsert({
      where: { noticeKey_userId: { noticeKey, userId } },
      create: { noticeKey, userId },
      update: {},
    });
  }
}
