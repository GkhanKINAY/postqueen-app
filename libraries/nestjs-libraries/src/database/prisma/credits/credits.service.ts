import { Injectable, Logger } from '@nestjs/common';
import {
  CreditGrantInput,
  CreditSpend,
  CreditsRepository,
  CurrentGrant,
  insufficientCredits,
} from '@gitroom/nestjs-libraries/database/prisma/credits/credits.repository';
import {
  LLM_CONTINUATION_FLOOR,
  LLM_TURN_MINIMUM,
  llmCreditCost,
  toCredits,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';

export interface LlmUsage {
  /** Unique per model call, so a callback that fires twice charges once. */
  key: string;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
  action: string;
}

/**
 * One credits balance per organization. Grants add to it, spends draw on it,
 * and every amount is in hundredths of a credit (`CREDIT_UNIT`).
 *
 * With billing off nothing is metered, the same rule the per-feature quotas
 * follow: the balance reads as unlimited and spends only run the work.
 */
@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

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
    // Work that costs nothing is not a charge; the ledger only takes amounts.
    if (!isBillingEnabled() || spend.amount === 0) {
      return Promise.resolve({ id: null, charged: false });
    }
    return this._creditsRepository.spend(organizationId, spend);
  }

  /**
   * Whether a Copilot turn may start: on any positive balance. The rest of a
   * turn, run again after a frontend tool, may start down to
   * `LLM_CONTINUATION_FLOOR`, so a turn that crossed zero on its way still
   * finishes. `pending` is a charge already owed but not yet written.
   */
  async assertLlmTurn(
    organizationId: string,
    continuation = false,
    pending = 0
  ) {
    if (!isBillingEnabled()) {
      return;
    }

    const { balance } = await this._creditsRepository.balance(organizationId);
    const left = balance - pending;
    if (left < (continuation ? LLM_CONTINUATION_FLOOR : LLM_TURN_MINIMUM)) {
      throw insufficientCredits(LLM_TURN_MINIMUM, left);
    }
  }

  /**
   * Tokens a model call used, charged once the call is done. The work is
   * already paid for by then, so the balance may go below zero; the next
   * turn is refused instead (`LLM_TURN_MINIMUM`).
   */
  chargeLlm(organizationId: string, usage: LlmUsage) {
    return this.spend(organizationId, {
      key: usage.key,
      amount: llmCreditCost(usage.model, usage.inputTokens, usage.outputTokens),
      action: usage.action,
      meta: {
        model: usage.model || null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
      allowOverdraft: true,
    });
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
      // The work's error is the answer; a refund that cannot be written is
      // logged rather than put in its place.
      if (charged) {
        await this.refund(organizationId, spend.key).catch((refundErr) =>
          this.logger.error(`Could not refund ${spend.key}: ${refundErr}`)
        );
      }
      throw err;
    }
  }

  /** See `CreditsRepository.reserve`: sets aside, adjusts or releases what
   * work costs when it runs. */
  reserve(organizationId: string, spend: CreditSpend) {
    if (!isBillingEnabled()) {
      return Promise.resolve({ id: null, charged: false });
    }
    return this._creditsRepository.reserve(organizationId, spend);
  }

  /** See `CreditsRepository.release`: a reservation handed back. */
  release(organizationId: string, key: string) {
    if (!isBillingEnabled()) {
      return Promise.resolve(false);
    }
    return this._creditsRepository.release(organizationId, key);
  }

  /** See `CreditsRepository.settle`: a reservation used by its work. */
  settle(organizationId: string, key: string, suffix: string) {
    if (!isBillingEnabled()) {
      return Promise.resolve(false);
    }
    return this._creditsRepository.settle(organizationId, key, suffix);
  }

  async reservations(organizationId: string, prefix: string) {
    if (!isBillingEnabled()) {
      return [];
    }
    return this._creditsRepository.reservations(organizationId, prefix);
  }

  everReserved(organizationId: string, prefix: string) {
    if (!isBillingEnabled()) {
      return Promise.resolve(false);
    }
    return this._creditsRepository.everReserved(organizationId, prefix);
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

  /** A refunded or disputed pack: what is left of it goes. */
  revokeByPaymentRef(organizationId: string, paymentRef: string) {
    if (!isBillingEnabled()) {
      return Promise.resolve({ count: 0 });
    }
    return this._creditsRepository.revokeByPaymentRef(
      organizationId,
      paymentRef
    );
  }

  revokeGrants(organizationId: string, sources: string[]) {
    if (!isBillingEnabled()) {
      return Promise.resolve({ count: 0 });
    }
    return this._creditsRepository.revokeGrants(organizationId, sources);
  }
}
