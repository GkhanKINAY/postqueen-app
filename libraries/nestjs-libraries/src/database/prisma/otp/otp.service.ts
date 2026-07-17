import { Injectable } from '@nestjs/common';
import { OtpRepository } from '@gitroom/nestjs-libraries/database/prisma/otp/otp.repository';
import { OtpPurpose } from '@prisma/client';

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
