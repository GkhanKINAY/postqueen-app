import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentService } from './payment.service.ts';

// Two registered providers that record which organizations they were asked
// to cancel, and a subscription row whose provider is whatever the test says.
const run = async (rowProvider: string | null) => {
  const cancelled: string[] = [];
  const provider = (name: string) => ({
    name,
    provider: {
      cancelAllSubscriptions: async (org: string) => {
        cancelled.push(`${name}:${org}`);
      },
    },
  });
  const providers = [provider('stripe'), provider('revenuecat')];
  const service = new PaymentService(
    {
      getProviders: () => providers,
      getProvider: (name: string) => {
        const found = providers.find((p) => p.name === name);
        if (!found) {
          throw new Error(`Payment provider ${name} not found`);
        }
        return found.provider;
      },
    } as any,
    {
      getSubscriptionByOrganizationId: async () =>
        rowProvider ? { provider: rowProvider } : null,
    } as any
  );
  await service.cancelAllSubscriptions('org-1');
  return cancelled;
};

describe('cancelling every subscription when an account is deleted', () => {
  it('asks only the provider that owns the subscription', async () => {
    assert.deepEqual(await run('stripe'), ['stripe:org-1']);
  });

  it('asks every provider when there is no subscription row', async () => {
    assert.deepEqual(await run(null), ['stripe:org-1', 'revenuecat:org-1']);
  });

  it('asks every provider for a grant no provider owns, instead of failing', async () => {
    assert.deepEqual(await run('manual'), ['stripe:org-1', 'revenuecat:org-1']);
  });
});
