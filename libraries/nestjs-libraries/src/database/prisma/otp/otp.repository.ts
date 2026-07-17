import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';

@Injectable()
export class OtpRepository {
  constructor(private _otp: PrismaRepository<'otpCode'>) {}

  create(data: {
    email: string;
    codeHash: string;
    purpose: OtpPurpose;
    expiresAt: Date;
    ip?: string;
  }) {
    return this._otp.model.otpCode.create({ data });
  }

  getLatestActive(email: string, purpose: OtpPurpose) {
    return this._otp.model.otpCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  incrementAttempts(id: string) {
    return this._otp.model.otpCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  consume(id: string) {
    return this._otp.model.otpCode.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  // Called before issuing a fresh code so a stale one can't be reused.
  invalidateActive(email: string, purpose: OtpPurpose) {
    return this._otp.model.otpCode.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
}
