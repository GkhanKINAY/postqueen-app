import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { UnconfiguredClippingProcessor } from '../../../upload/unconfigured.clipping.processor.ts';
import { ClippingNotConfiguredError } from '../../../upload/clipping.processor.interface.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const service = read('./clipping.service.ts');
const migration = read('../migrations/20260919120000_clipping/migration.sql');
const factory = read('../../../upload/upload.factory.ts');
const temporalModule = read('../../../temporal/temporal.module.ts');
const startMcp = read('../../../chat/start.mcp.ts');
const loadTools = read('../../../chat/load.tools.service.ts');
const tools = [
  read('../../../chat/tools/clipping.tool.ts'),
  read('../../../chat/tools/clipping.status.tool.ts'),
  read('../../../chat/tools/clipping.widget.ticket.tool.ts'),
];
const workflow = read('../../../../../../apps/orchestrator/src/workflows/clipping.workflow.ts');
const activity = read('../../../../../../apps/orchestrator/src/activities/clipping.activity.ts');
const orchestratorModule = read('../../../../../../apps/orchestrator/src/app.module.ts');
const billing = [
  read('../../../../../../apps/frontend/src/components/billing/first.billing.component.tsx'),
  read('../../../../../../apps/frontend/src/components/billing/main.billing.component.tsx'),
];

describe('Video clipping without a processor', () => {
  it('fails every job with a clear reason until a processor is configured', async () => {
    const processor = new UnconfiguredClippingProcessor();
    await assert.rejects(() => processor.ingest(), ClippingNotConfiguredError);
    await assert.rejects(() => processor.clip(), /Clipping is not configured/);
    assert.match(factory, /default:\n\s+return new UnconfiguredClippingProcessor\(\);/);
    // the service turns it into a stop the customer reads, never a retry
    assert.match(service, /if \(err instanceof ClippingNotConfiguredError\) \{\n\s+throw new ClippingStop\(/);
  });

  it('refuses to start, and hides its tools and widget, while it is off', () => {
    assert.match(service, /!UploadFactory\.clippingEnabled\(\) \|\|/);
    assert.match(service, /throw new HttpException\('Clipping is not configured', 503\);/);
    for (const tool of tools) {
      assert.match(tool, /available\(\) \{\n\s+return UploadFactory\.clippingEnabled\(\);/);
    }
    assert.match(loadTools, /\.filter\(\(p\) => !p\.available \|\| p\.available\(\)\)/);
    assert.match(startMcp, /\.\.\.\(clippingEnabled\n\s+\? \{\n\s+\[CLIPPING_WIDGET_URI\]/);
    // no plan advertises minutes nobody can spend
    for (const source of billing) {
      assert.match(source, /if \(clippingEnabled && currentPricing\?\.clipping_minutes\) \{/);
    }
  });

  it('runs the processor jobs on their own queue, heartbeating', () => {
    assert.match(temporalModule, /identifier: 'clipping',\n\s+maxConcurrentJob: Number\(process\.env\.CLIPPING_CONCURRENCY\) \|\| 1,/);
    assert.match(workflow, /const \{ analyseClipping, fetchClip, renderClip \} =\n\s+proxyActivities<ClippingActivity>\(\{\n\s+taskQueue: 'clipping',/);
    assert.match(workflow, /heartbeatTimeout: '2 minute',/);
    // a value import would pull Nest into the workflow bundle
    assert.match(workflow, /import type \{ ClippingActivity \}/);
    assert.doesNotMatch(workflow, /^import \{[^}]*\} from '@gitroom/m);
    for (const method of ['analyseClipping', 'fetchClip', 'renderClip']) {
      assert.match(activity, new RegExp(`async ${method}\\(\\{ [a-zA-Z]+ \\}: \\{ [a-zA-Z]+: string \\}\\) \\{\\n\\s+return withHeartbeat\\(`));
    }
    assert.match(orchestratorModule, /MediaActivity,\n\s+ClippingActivity,\n/);
  });

  // Production boots with `prisma db push --accept-data-loss`, which applies
  // whatever the schema says: the change has to be new tables only
  it('adds tables and touches nothing that exists', () => {
    const sql = migration.replace(/^--.*$/gm, '');
    assert.doesNotMatch(sql, /\bDROP\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE "(?!Clipping"|ClippingClip")/);
    assert.equal(sql.match(/CREATE TABLE/g)?.length, 2);
  });
});
