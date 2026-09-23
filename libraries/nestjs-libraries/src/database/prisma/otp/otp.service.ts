import { Injectable } from '@nestjs/common';
import { OtpRepository } from '@gitroom/nestjs-libraries/database/prisma/otp/otp.repository';
import { OtpPurpose } from '@gitroom/nestjs-libraries/database/prisma/generated/client';

@Injectable()
export class OtpService {
  constructor(private _otpRepository: OtpRepository) {}

  create(data: {
    email: string;
    codeHash: string;
    purpose: OtpPurpose;
    expiresAt: Date;
    ip?: string;
  }) {
    // Each row keeps an email and an IP long after its code stops working, so
    // opportunistically prune the ones more than a day past their expiry
    this._otpRepository
      .deleteExpired(new Date(Date.now() - 24 * 60 * 60 * 1000))
      .catch(() => {});

    return this._otpRepository.create(data);
  }

  getLatestActive(email: string, purpose: OtpPurpose) {
    return this._otpRepository.getLatestActive(email, purpose);
  }

  incrementAttempts(id: string) {
    return this._otpRepository.incrementAttempts(id);
  }

  consume(id: string) {
    return this._otpRepository.consume(id);
  }

  invalidateActive(email: string, purpose: OtpPurpose) {
    return this._otpRepository.invalidateActive(email, purpose);
  }
}
