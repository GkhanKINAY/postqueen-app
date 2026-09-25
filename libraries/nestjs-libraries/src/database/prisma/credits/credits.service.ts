import { Injectable } from '@nestjs/common';
import {
  CreditGrantInput,
  CreditSpend,
  CreditsRepository,
  CurrentGrant,
  insufficientCredits,
} from '@gitroom/nestjs-libraries/database/prisma/credits/credits.repository';
import { toCredits } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';

/**
 * One credits balance per organization. Grants add to it, spends draw on it,
 * and every amount is in hundredths of a credit (`CREDIT_UNIT`).
 *
 * With billing off nothing is metered, the same rule the per-feature quotas
 * follow: the balance reads as unlimited and spends only run the work.
 */
@Injectable()
export class CreditsService {
  constructor(private _creditsRepository: CreditsRepository) {}

  async balance(organizationId: string) {
    // `balance: null` rather than a number, so a screen that forgets to check
    // `unlimited` shows nothing instead of a wrong figure.
    if (!isBillingEnabled()) {
      return { unlimited: true, balance: null, expiring: null };
    }

    const { balance, expiring } = await this._creditsRepository.balance(
      organizationId
    );

    return {
      unlimited: false,
      balance: toCredits(balance),
      expiring: expiring
        ? { amount: toCredits(expiring.amount), at: expiring.at }
        : null,
    };
  }

  /** Refuses up front, before work that is paid for once it is finished. */
  async assertAvailable(organizationId: string, amount: number) {
    if (!isBillingEnabled()) {
      return;
    }

    const { balance } = await this._creditsRepository.balance(organizationId);
    if (amount > balance) {
      throw insufficientCredits(amount, balance);
    }
  }

  spend(organizationId: string, spend: CreditSpend) {
    if (!isBillingEnabled()) {
      return Promise.resolve({ id: null, charged: false });
    }
    return this._creditsRepository.spend(organizationId, spend);
  }

  refund(organizationId: string, key: string) {
    if (!isBillingEnabled()) {
      return Promise.resolve(false);
    }
    return this._creditsRepository.refund(organizationId, key);
  }

  /**
   * Charges, runs the work, and hands the charge back if the work throws.
   * The charge comes first so two requests cannot both spend the last credit.
   * Only a charge this call made is handed back: a retry that found the key
   * already paid must not refund the attempt that paid it.
   */
  async withCredits<T>(
    organizationId: string,
    spend: CreditSpend,
    work: () => Promise<T>
  ): Promise<T> {
    const { charged } = await this.spend(organizationId, spend);
    try {
      return await work();
    } catch (err) {
      if (charged) {
        await this.refund(organizationId, spend.key);
      }
      throw err;
    }
  }

  grant(organizationId: string, grant: CreditGrantInput, close: string[] = []) {
    if (!isBillingEnabled()) {
      return Promise.resolve({ id: null, granted: false });
    }
    return this._creditsRepository.grant(organizationId, grant, close);
  }

  /** Grants from these sources still in force, newest first. */
  currentGrants(organizationId: string, sources: string[]) {
    return this._creditsRepository.currentGrants(organizationId, sources);
  }

  /** See `CreditsRepository.grantWith`: decide and grant under the lock. */
  grantWith(
    organizationId: string,
    sources: string[],
    decide: (
      current: CurrentGrant[]
    ) => { grant: CreditGrantInput; close?: string[] } | null
  ) {
    if (!isBillingEnabled()) {
      return Promise.resolve({ id: null, granted: false });
    }
    return this._creditsRepository.grantWith(organizationId, sources, decide);
  }

  revokeGrants(organizationId: string, sources: string[]) {
    if (!isBillingEnabled()) {
      return Promise.resolve({ count: 0 });
    }
    return this._creditsRepository.revokeGrants(organizationId, sources);
  }
}
