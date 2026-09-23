import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  COPILOT_PURGE_MODELS,
  ORGANIZATION_PURGE_STEPS,
  PURGE_GRACE_DAYS,
  PURGE_KEEP,
  USER_PURGE_STEPS,
  copilotResourceIds,
  daysAgo,
  fileKeyOf,
  keysUsedIn,
  organizationSkipReason,
  ownFiles,
  postImageUrls,
  purgeCountsLine,
  urlsInText,
  userSkipReason,
} from './account-purge.plan.ts';
import { ownUploadPath } from '../../../integrations/read.or.fetch.ts';
import {
  accountPurgeHolds,
  accountPurgeMode,
} from '../../../../../helpers/src/utils/account.purge.mode.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const plan = read('./account-purge.plan.ts');
const service = read('./account-purge.service.ts');
const repository = read('./account-purge.repository.ts');
const schema = read('../schema.prisma');
const migration = read(
  '../migrations/20260923120000_account_purge/migration.sql'
);
const databaseModule = read('../database.module.ts');
const cloudflare = read('../../../upload/cloudflare.storage.ts');
const uploadInterface = read('../../../upload/upload.interface.ts');
const mastraService = read('../../../chat/mastra.service.ts');
const register = read('../../../temporal/infinite.workflow.register.ts');
const clipping = read('../clipping/clipping.service.ts');
const orchestrator = '../../../../../../apps/orchestrator/src';
const workflow = read(`${orchestrator}/workflows/account.purge.workflow.v1.ts`);
const workflowIndex = read(`${orchestrator}/workflows/index.ts`);
const activity = read(`${orchestrator}/activities/account-purge.activity.ts`);
const orchestratorModule = read(`${orchestrator}/app.module.ts`);

// The storage every test below pretends to be: an R2 bucket served from our
// own /api/uploads route, with keys as CloudflareStorage writes them.
const UPLOADS = 'https://app.example.test/api/uploads';
const KEY = /^[A-Za-z0-9_-]{1,120}\.[a-z0-9]{1,5}$/i;
const isOwnFile = (url: string) =>
  url.startsWith(`${UPLOADS}/`) &&
  KEY.test(url.slice(UPLOADS.length + 1).split(/[?#]/)[0]);

type Field = {
  name: string;
  type: string;
  list: boolean;
  optional: boolean;
  attributes: string;
};
type Model = { name: string; ignored: boolean; fields: Field[] };

// Enough of schema.prisma to see which models point at which.
const models: Model[] = [
  ...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm),
].map(([, name, body]) => ({
  name,
  ignored: /^\s*@@ignore/m.test(body),
  fields: body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => {
      const [, field, type, modifier, attributes] =
        line.match(/^(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/) || [];
      return {
        name: field,
        type,
        list: modifier === '[]',
        optional: modifier === '?',
        attributes: attributes || '',
      };
    })
    .filter((field) => field.name),
}));
const modelNames = new Set(models.map((model) => model.name));

describe('Mode and legal hold', () => {
  it('is off unless set to dry-run or on', () => {
    assert.equal(accountPurgeMode(undefined), 'off');
    assert.equal(accountPurgeMode(''), 'off');
    assert.equal(accountPurgeMode('true'), 'off');
    assert.equal(accountPurgeMode('yes'), 'off');
    assert.equal(accountPurgeMode(' Dry-Run '), 'dry-run');
    assert.equal(accountPurgeMode('ON'), 'on');
  });

  it('starts the workflow only when the mode is not off, under a fixed id', () => {
    assert.match(
      register,
      /if \(accountPurgeMode\(\) !== 'off'\) \{\n\s+try \{\n\s+await this\._temporalService\.client\n\s+\?\.getRawClient\(\)\n\s+\?\.workflow\?\.start\('accountPurgeWorkflowV1', \{\n\s+workflowId: 'account-purge-v1',/
    );
    // not under RUN_CRON: its own block after the RUN_CRON one closes
    assert.ok(
      register.indexOf("accountPurgeMode() !== 'off'") >
        register.lastIndexOf("'analytics-sync-workflow-v1'")
    );
  });

  it('reads a comma or space separated hold list', () => {
    assert.deepEqual([...accountPurgeHolds(' a, b  c,,')], ['a', 'b', 'c']);
    assert.equal(accountPurgeHolds(undefined).size, 0);
  });
});

describe('File collection', () => {
  it('reads every Post.image shape, and survives bad JSON and null', () => {
    assert.deepEqual(
      postImageUrls(
        JSON.stringify([
          { id: '1', path: `${UPLOADS}/aaaaaaaaaa.png` },
          { url: `${UPLOADS}/bbbbbbbbbb.jpg` },
          {
            path: `${UPLOADS}/cccccccccc.mp4`,
            thumbnail: `${UPLOADS}/dddddddddd.jpg`,
          },
          null,
          'text',
        ])
      ),
      [
        `${UPLOADS}/aaaaaaaaaa.png`,
        `${UPLOADS}/bbbbbbbbbb.jpg`,
        `${UPLOADS}/cccccccccc.mp4`,
        `${UPLOADS}/dddddddddd.jpg`,
      ]
    );
    assert.deepEqual(postImageUrls(null), []);
    assert.deepEqual(postImageUrls(''), []);
    assert.deepEqual(postImageUrls(`[{"path":"${UPLOADS}/eeeeeeeeee.png"`), [
      `${UPLOADS}/eeeeeeeeee.png`,
    ]);
    assert.deepEqual(
      postImageUrls(JSON.stringify({ path: `${UPLOADS}/ffffffffff.png` })),
      [`${UPLOADS}/ffffffffff.png`]
    );
  });

  it('finds storage URLs inside HTML content and JSON text', () => {
    const html = `<p>Hello <img src="${UPLOADS}/aaaaaaaaaa.png"> and (${UPLOADS}/bbbbbbbbbb.jpg).</p><a href='https://other.example/x.png'>x</a> ${UPLOADS}/cccccccccc.webp, end`;
    assert.deepEqual(urlsInText(html), [
      `${UPLOADS}/aaaaaaaaaa.png`,
      `${UPLOADS}/bbbbbbbbbb.jpg`,
      'https://other.example/x.png',
      `${UPLOADS}/cccccccccc.webp`,
    ]);
    assert.deepEqual(urlsInText(null), []);
  });

  it('keeps only this storage own keys, one URL per key', () => {
    const files = ownFiles(
      [
        `${UPLOADS}/aaaaaaaaaa.png`,
        `${UPLOADS}/aaaaaaaaaa.png?v=2`,
        'https://cdn.other.example/api/uploads/bbbbbbbbbb.png',
        'https://pbs.twimg.com/media/cccccccccc.jpg',
        `${UPLOADS}/../x`,
        `${UPLOADS}/nested/dddddddddd.png`,
        `${UPLOADS}/eeeeeeeeee`,
        '',
      ],
      isOwnFile
    );
    assert.deepEqual([...files.keys()], ['aaaaaaaaaa.png']);
    assert.equal(files.get('aaaaaaaaaa.png'), `${UPLOADS}/aaaaaaaaaa.png`);
  });

  it('rejects local paths that leave UPLOAD_DIRECTORY', () => {
    const env = { ...process.env };
    process.env.FRONTEND_URL = 'http://app.example.test';
    process.env.UPLOAD_DIRECTORY = '/srv/uploads';
    try {
      const local = (url: string) => !!ownUploadPath(url);
      assert.equal(
        local('http://app.example.test/uploads/2026/09/23/aaaaaaaaaa.png'),
        true
      );
      assert.equal(
        local('http://app.example.test/uploads/../../etc/passwd'),
        false
      );
      assert.equal(local('http://app.example.test/uploads/'), false);
      assert.equal(
        local('http://elsewhere.test/uploads/2026/09/23/a.png'),
        false
      );
    } finally {
      process.env = env;
    }
  });

  it('asks the storage provider, never a provider name', () => {
    assert.match(uploadInterface, /isOwnFile\(path: string\): boolean;/);
    // R2: a key directly under the upload URL, checked with the same KEY
    // that keyOf uses, so ../x and other hosts are never ours
    assert.match(
      cloudflare,
      /isOwnFile\(path: string\) \{\n\s+if \(!this\._uploadUrl\) \{\n\s+return false;\n\s+\}\n\s+const base = `\$\{this\._uploadUrl\.replace\(\/\\\/\+\$\/, ''\)\}\/`;\n\s+return \(\n\s+path\.startsWith\(base\) &&\n\s+KEY\.test\(path\.slice\(base\.length\)\.split\(\/\[\?#\]\/\)\[0\]\)/
    );
    assert.doesNotMatch(service, /cloudflare|STORAGE_PROVIDER|LocalStorage/i);
    assert.match(service, /this\.storage\.isOwnFile\(url\)/);
  });

  it('keys a URL by its last segment, the way storage names objects', () => {
    assert.equal(
      fileKeyOf(`${UPLOADS}/aaaaaaaaaa.png?x=1#y`),
      'aaaaaaaaaa.png'
    );
    assert.equal(
      fileKeyOf('http://app.example.test/uploads/2026/09/23/abc.png'),
      'abc.png'
    );
  });

  it('takes the derived clipping keys from the clipping service', () => {
    assert.match(
      clipping,
      /derivedFileKeys\(clippingIds: string\[\], clipIds: string\[\]\) \{\n\s+return \[\n\s+\.\.\.clippingIds\.flatMap\(\(id\) => Object\.values\(this\.keys\(id\)\)\),\n\s+\.\.\.clipIds\.flatMap\(\(id\) => Object\.values\(this\.clipKeys\(id\)\)\),/
    );
    assert.match(service, /this\._clippingService\n\s+\.derivedFileKeys\(/);
  });
});

describe('Shared-key filter', () => {
  it('keeps a key another row still contains, whatever host it was saved under', () => {
    const keys = ['aaaaaaaaaa.png', 'bbbbbbbbbb.png', 'cccccccccc.mp4'];
    const used = keysUsedIn(keys, [
      // another organization's media row
      'https://pub-old.r2.dev/aaaaaaaaaa.png',
      // a live post in another organization
      `<p><img src="${UPLOADS}/cccccccccc.mp4"></p>`,
      null,
      undefined,
    ]);
    assert.deepEqual([...used].sort(), ['aaaaaaaaaa.png', 'cccccccccc.mp4']);
  });

  it('looks in every column of other organizations that can hold a file URL', () => {
    const lookup = repository.slice(
      repository.indexOf('async valuesUsingKeys('),
      repository.indexOf('integrationPictures(')
    );
    for (const [model, fields] of [
      ['media', ["'path'", "'thumbnail'"]],
      ['post', ["'image'", "'content'", "'settings'"]],
      ['integration', ["'picture'"]],
      ['sets', ["'content'"]],
      ['signatures', ["'content'"]],
    ] as const) {
      assert.match(
        lookup,
        new RegExp(
          `model\\.${model}\\.findMany\\(\\{\\n\\s+where: \\{\\n?\\s*organizationId: \\{ not: orgId \\}`
        )
      );
      for (const field of fields) {
        assert.ok(lookup.includes(`contains(${field})`), `${model} ${field}`);
      }
    }
  });

  it('keeps a media row, and its file, that a live user, another app or a live agency uses', () => {
    const inUse = repository.slice(
      repository.indexOf('private mediaInUse('),
      repository.indexOf('mediaWithFiles(')
    );
    assert.match(inUse, /\{ userPicture: \{ some: \{ deletedAt: null \} \} \}/);
    assert.match(
      inUse,
      /oauthApps: \{\s+some: \{\s+deletedAt: null,\s+OR: \[\s+\{ organizationId: null \},\s+\{ organizationId: \{ not: orgId \} \},\s+\],/
    );
    assert.match(
      inUse,
      /agencies: \{ some: \{ deletedAt: null, user: \{ deletedAt: null \} \} \}/
    );
    // the rows stay, and their files are in the shared set before any lookup
    assert.match(
      repository,
      /NOT: this\.mediaInUse\(orgId\),\n\s+\},\n\s+select: \{ id: true, path: true, thumbnail: true \}/
    );
    assert.match(
      service,
      /const kept = await this\._accountPurgeRepository\.mediaKeptInUse\(orgId\);\n\s+call\.counts\.mediaKept = kept\.length;\n\s+call\.inUse = kept\.flatMap\(\(media\) => \[media\.path, media\.thumbnail\]\);/
    );
    assert.match(service, /const shared = keysUsedIn\(keys, call\.inUse\);/);
  });

  it('batches the lookups and the removals', () => {
    assert.match(service, /import \{ chunk \} from 'lodash';/);
    assert.match(
      service,
      /chunk\(\n\s+keys\.filter\(\(key\) => !shared\.has\(key\)\),\n\s+KEY_BATCH\n\s+\)/
    );
    assert.match(
      service,
      /for \(const batch of chunk\(removable, FILE_BATCH\)\)/
    );
  });
});

describe('Guards', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const graceEndsBefore = daysAgo(PURGE_GRACE_DAYS, now);
  const old = daysAgo(PURGE_GRACE_DAYS + 2, now);
  const org = {
    deletedAt: old,
    purgedAt: null,
    activeMembers: 0,
    subscription: null,
  };
  const options = { held: false, graceEndsBefore, billingEnabled: true };

  it('purges a deleted organization past its grace with nobody in it', () => {
    assert.equal(organizationSkipReason(org, options), null);
  });

  it('skips an organization with an active member', () => {
    assert.equal(
      organizationSkipReason({ ...org, activeMembers: 1 }, options),
      'active-member'
    );
  });

  it('skips an organization deleted less than the grace ago', () => {
    assert.equal(
      organizationSkipReason({ ...org, deletedAt: daysAgo(1, now) }, options),
      'grace'
    );
    // quiesce has no grace, and does not wait on billing either
    assert.equal(
      organizationSkipReason(
        { ...org, deletedAt: daysAgo(1, now) },
        { ...options, graceEndsBefore: undefined }
      ),
      null
    );
    assert.match(
      service,
      /graceEndsBefore: purge \? daysAgo\(PURGE_GRACE_DAYS\) : undefined,\n\s+billingEnabled: purge && isBillingEnabled\(\),/
    );
  });

  it('skips an organization on hold', () => {
    assert.equal(
      organizationSkipReason(org, { ...options, held: true }),
      'hold'
    );
  });

  it('skips a live, missing or already purged organization', () => {
    assert.equal(organizationSkipReason(null, options), 'missing');
    assert.equal(
      organizationSkipReason({ ...org, deletedAt: null }, options),
      'not-deleted'
    );
    assert.equal(
      organizationSkipReason({ ...org, purgedAt: now }, options),
      'purged'
    );
  });

  it('waits on a subscription the cancel did not remove, but not on lifetime', () => {
    assert.equal(
      organizationSkipReason(
        { ...org, subscription: { isLifetime: false } },
        options
      ),
      'subscription'
    );
    assert.equal(
      organizationSkipReason(
        { ...org, subscription: { isLifetime: true } },
        options
      ),
      null
    );
    assert.equal(
      organizationSkipReason(
        { ...org, subscription: { isLifetime: false } },
        { ...options, billingEnabled: false }
      ),
      null
    );
  });

  it('guards a user the same way, and on a membership in a live workspace', () => {
    const user = { deletedAt: old, purgedAt: null, liveMemberships: 0 };
    const userOptions = { held: false, graceEndsBefore };
    assert.equal(userSkipReason(user, userOptions), null);
    assert.equal(
      userSkipReason({ ...user, liveMemberships: 1 }, userOptions),
      'live-membership'
    );
    assert.equal(
      userSkipReason({ ...user, deletedAt: daysAgo(1, now) }, userOptions),
      'grace'
    );
    assert.equal(userSkipReason(user, { ...userOptions, held: true }), 'hold');
    assert.equal(
      userSkipReason({ ...user, purgedAt: now }, userOptions),
      'purged'
    );
  });

  it('re-reads the guard on every call', () => {
    assert.match(
      service,
      /private async purgeOrganization\([\s\S]*?\) \{\n\s+const skip = await this\.organizationSkip\(orgId, true\);/
    );
    assert.match(
      service,
      /private async quiesceOrganization\([\s\S]*?\) \{\n\s+const skip = await this\.organizationSkip\(orgId, false\);/
    );
    assert.match(
      service,
      /private async purgeUser\([\s\S]*?\) \{\n\s+const guard = await this\._accountPurgeRepository\.getUserGuard\(userId\);/
    );
    // an active member is someone not disabled whose account is not deleted
    assert.match(
      repository,
      /users: \{\n\s+where: \{ disabled: false, user: \{ deletedAt: null \} \},/
    );
  });
});

describe('Dry-run and idempotency', () => {
  it('writes nothing in dry-run: every write sits behind apply', () => {
    // each step method counts when apply is false and deletes when it is true
    assert.match(
      repository,
      /if \(!apply\) \{\n\s+return \{ count: await count\(\), more: false \};\n\s+\}/
    );
    // file tables: dry-run pages through and returns before any removal
    const withFiles = service.slice(
      service.indexOf('private async withFiles<'),
      service.indexOf('private async threads(')
    );
    assert.ok(
      withFiles.indexOf('if (!apply) {') < withFiles.indexOf('table.remove('),
      'rows are removed only past the dry-run branch'
    );
    const files = service.slice(
      service.indexOf('private async files('),
      service.indexOf('private async sharedKeys(')
    );
    assert.match(
      files,
      /if \(!apply\) \{\n\s+return;\n\s+\}\n[\s\S]*this\.storage\.removeFile\(url\)/
    );
    // quiesce: counts running workflows, terminates only when applying
    assert.match(
      service,
      /workflows\+\+;\n\s+if \(apply\) \{\n\s+const result = await this\._temporalService\.terminateWorkflow\(/
    );
  });

  it('writes purgedAt last, only once every step is done, and only when applying', () => {
    const purge = service.slice(
      service.indexOf('private async purgeOrganization('),
      service.indexOf('private organizationStep(')
    );
    assert.match(
      purge,
      /if \(more\) \{\n[\s\S]*?return \{ done: false \};\n\s+\}\n\s+\}/
    );
    assert.match(
      purge,
      /if \(!apply\) \{\n[\s\S]*?return \{ done: true \};\n\s+\}\n\n\s+await this\._accountPurgeRepository\.tombstoneOrganization\(orgId\);/
    );
    assert.ok(
      purge.indexOf('for (const { step } of ORGANIZATION_PURGE_STEPS)') <
        purge.indexOf('tombstoneOrganization(')
    );
    // purgedAt is written in the two tombstone methods and nowhere else
    const writes = [...repository.matchAll(/purgedAt: (now|new Date\(\))/g)];
    assert.equal(writes.length, 2);
    for (const write of writes) {
      const before = repository.slice(0, write.index);
      assert.ok(
        before.lastIndexOf('tombstoneOrganization(') >
          before.lastIndexOf('\n  }\n') ||
          before.lastIndexOf('tombstoneUser(') > before.lastIndexOf('\n  }\n'),
        'purgedAt is only set by a tombstone method'
      );
    }
    // the organization tombstone and purgedAt land in one transaction
    assert.match(
      repository,
      /return this\._transaction\.model\.\$transaction\(\[\n\s+\.\.\.integrations\.map\(/
    );
  });

  it('scopes every delete by the organization or user and caps the batch', () => {
    const deletes = [...repository.matchAll(/\.deleteMany\(\{([\s\S]*?)\}\)/g)];
    assert.ok(deletes.length > 30);
    for (const [, args] of deletes) {
      assert.ok(
        /\bwhere\b/.test(args),
        `a deleteMany without a where: ${args.slice(0, 80)}`
      );
    }
    // removing files before rows: a crash in between finds both next time
    assert.match(
      service,
      /await this\.files\(orgId, rows\.flatMap\(table\.urls\), true, call, table\.saved\);\n\s+const \{ count \} = await table\.remove\(rows\.map\(\(row\) => row\.id\)\);/
    );
    // a file that could not be removed keeps its rows
    assert.match(
      service,
      /if \(failed\) \{\n\s+throw new Error\(\n\s+`\[purge\] org=\$\{orgId\} could not remove \$\{failed\} files, rows kept for the next run`/
    );
  });

  it('logs ids and counts only', () => {
    assert.equal(
      purgeCountsLine({ posts: 3, media: 0, files: 2 }),
      'posts=3 files=2'
    );
    for (const line of service.match(/Logger\.(log|warn)\([\s\S]*?\);/g) ||
      []) {
      assert.doesNotMatch(line, /email|content|name\b|metadata|url\b/i, line);
    }
  });

  it('bounds a dry-run in time, and says when its counts are partial', () => {
    assert.match(plan, /export const DRY_RUN_BUDGET_MS = 5 \* 60 \* 1000;/);
    assert.match(service, /deadline: Date\.now\(\) \+ DRY_RUN_BUDGET_MS,/);
    assert.match(
      service,
      /private outOfTime\(call: PurgeCall\) \{\n\s+if \(Date\.now\(\) < call\.deadline\) \{\n\s+return false;\n\s+\}\n\s+call\.counts\.partial = 1;/
    );
    // checked before every page, in both paging loops
    assert.equal(
      (
        service.match(
          /for \(;;\) \{\n\s+if \(this\.outOfTime\(call\)\) \{\n\s+return \{ count: total, more: false \};/g
        ) || []
      ).length,
      2
    );
  });
});

describe('Plan coverage and order', () => {
  const orgModels = ORGANIZATION_PURGE_STEPS.map((step) => step.model);
  const userModels = USER_PURGE_STEPS.map((step) => step.model);
  const planned = new Set<string>([
    ...orgModels,
    ...userModels,
    ...COPILOT_PURGE_MODELS,
  ]);

  it('names only models that exist and that Prisma can address', () => {
    for (const name of planned) {
      const model = models.find((m) => m.name === name);
      assert.ok(model, `${name} is in schema.prisma`);
      assert.equal(model.ignored, false, `${name} is not @@ignore`);
    }
    for (const name of Object.keys(PURGE_KEEP)) {
      assert.ok(modelNames.has(name), `${name} is in schema.prisma`);
      assert.ok(!planned.has(name) || name === 'PayoutProblems', name);
    }
  });

  it('accounts for every model related to an organization or a user', () => {
    const related = models.filter((model) =>
      model.fields.some((field) =>
        ['Organization', 'User'].includes(field.type)
      )
    );
    assert.ok(related.length > 25);
    for (const model of [
      ...related.map((m) => m.name),
      'Organization',
      'User',
    ]) {
      assert.ok(
        planned.has(model) || PURGE_KEEP[model],
        `${model} is neither purged nor kept with a reason`
      );
    }
  });

  it('accounts for every Copilot table keyed by a resource or a thread', () => {
    const keyed = models.filter(
      (model) =>
        model.name.startsWith('mastra_') &&
        model.fields.some((field) =>
          /^(resource_?id|thread_?id|sourceThreadId)$/i.test(field.name)
        )
    );
    assert.ok(keyed.length >= 10);
    for (const model of keyed) {
      assert.ok(
        (COPILOT_PURGE_MODELS as readonly string[]).includes(model.name) ||
          PURGE_KEEP[model.name],
        `${model.name} is neither purged nor kept with a reason`
      );
    }
    // and each one purged is really queried
    for (const name of COPILOT_PURGE_MODELS) {
      assert.ok(repository.includes(`model.${name}.`), name);
    }
  });

  it('deletes children before parents for every required relation', () => {
    const order = (steps: readonly { model: string; update?: boolean }[]) => {
      const index = new Map<string, number>();
      steps.forEach((step, i) => {
        if (!('update' in step && step.update) && !index.has(step.model)) {
          index.set(step.model, i);
        }
      });
      return index;
    };
    for (const steps of [ORGANIZATION_PURGE_STEPS, USER_PURGE_STEPS]) {
      const index = order(steps);
      for (const [child, at] of index) {
        const model = models.find((m) => m.name === child)!;
        for (const field of model.fields) {
          const holdsKey = /@relation\([^)]*fields:/.test(field.attributes);
          const parentAt = index.get(field.type);
          if (!holdsKey || parentAt === undefined || field.type === child) {
            continue;
          }
          if (!field.optional || /onDelete: Restrict/.test(field.attributes)) {
            assert.ok(
              at < parentAt,
              `${child}.${field.name} is removed before ${field.type}`
            );
          }
        }
      }
    }
    // the one self relation, Post.parentPost, is cleared before posts go
    const steps = ORGANIZATION_PURGE_STEPS.map((step) => step.step);
    assert.ok(steps.indexOf('postLinks') < steps.indexOf('posts'));
    assert.match(
      repository,
      /parentPost: \{ organizationId: orgId \},\n\s+\};[\s\S]*data: \{ parentPostId: null \}/
    );
  });

  it('handles every step, and stops at a step that has more', () => {
    for (const { step } of [...ORGANIZATION_PURGE_STEPS, ...USER_PURGE_STEPS]) {
      assert.ok(service.includes(`case '${step}':`), step);
    }
    assert.match(
      service,
      /call\.counts\[step\] = \(call\.counts\[step\] \|\| 0\) \+ count;\n\s+if \(more\) \{/
    );
  });

  it('keeps the tombstone fields billing and the trial check read', () => {
    const tombstone = repository.slice(
      repository.indexOf('async tombstoneOrganization('),
      repository.indexOf('// User steps')
    );
    assert.doesNotMatch(tombstone, /rootInternalId|paymentId|usedCodes/);
    assert.match(tombstone, /internalId: `purged_\$\{integration\.id\}`/);
    assert.match(
      tombstone,
      /name: 'Deleted workspace',\n\s+description: null,\n\s+apiKey: null,/
    );
    assert.doesNotMatch(
      repository,
      /model\.usedCodes|PrismaRepository<'usedCodes'>/
    );
    assert.match(repository, /email: `deleted_\$\{makeId\(32\)\}`/);
  });

  it('asks before removing a deleted member comments in a live workspace', () => {
    assert.match(
      plan,
      /export const MEMBER_COMMENTS_IN_LIVE_WORKSPACES: 'keep' \| 'delete' = 'keep';/
    );
    assert.match(
      service,
      /step === 'memberComments' &&\n\s+MEMBER_COMMENTS_IN_LIVE_WORKSPACES === 'keep'/
    );
  });

  it('files Copilot threads under the same resource ids Mastra does', () => {
    assert.deepEqual(copilotResourceIds('org-1'), ['org-1', 'org-1:composer']);
    assert.match(
      mastraService,
      /\? `\$\{organizationId\}:composer`\n\s+: organizationId;/
    );
  });
});

describe('Wiring', () => {
  it('uses Prisma only', () => {
    assert.doesNotMatch(
      repository,
      /\$queryRaw|\$executeRaw|queryRawUnsafe|executeRawUnsafe/
    );
    assert.doesNotMatch(
      service,
      /\$queryRaw|\$executeRaw|PrismaService|PrismaRepository/
    );
  });

  it('adds purgedAt with indexes, additively', () => {
    assert.match(schema, /purgedAt\s+DateTime\?\n\s+autoPost\s+AutoPost\[\]/);
    assert.match(schema, /purgedAt\s+DateTime\?\n\s+comments\s+Comments\[\]/);
    assert.equal((schema.match(/@@index\(\[purgedAt\]\)/g) || []).length, 2);
    assert.match(
      migration,
      /ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP\(3\);/
    );
    assert.match(
      migration,
      /ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP\(3\);/
    );
    assert.match(
      migration,
      /CREATE INDEX IF NOT EXISTS "Organization_purgedAt_idx"/
    );
    assert.match(migration, /CREATE INDEX IF NOT EXISTS "User_purgedAt_idx"/);
    assert.doesNotMatch(migration, /DROP|UPDATE|DELETE/);
  });

  it('registers the service and repository', () => {
    assert.match(
      databaseModule,
      /\n\s+AccountPurgeRepository,\n\s+AccountPurgeService,\n/
    );
  });

  it('registers the activity with the worker and exports the workflow', () => {
    assert.match(
      orchestratorModule,
      /const activities = \[[\s\S]*\n\s+AccountPurgeActivity,\n\];/
    );
    assert.match(
      workflowIndex,
      /export \* from '\.\/account\.purge\.workflow\.v1';/
    );
    // a type import keeps Nest out of the workflow bundle
    assert.match(workflow, /import type \{ AccountPurgeActivity \}/);
    assert.match(
      workflow,
      /export async function accountPurgeWorkflowV1\(\) \{/
    );
    assert.match(workflow, /await sleep\('1 day'\);/);
    assert.match(workflow, /return await continueAsNew\(\);/);
    // a long first run hands its history over mid-run, outside the try that
    // would swallow continueAsNew
    assert.match(
      workflow,
      /for \(const target of targets\) \{\n\s+if \(workflowInfo\(\)\.continueAsNewSuggested\) \{\n\s+handOver = true;\n\s+break;/
    );
    assert.match(
      workflow,
      /\}\n\s+if \(handOver\) \{\n\s+return await continueAsNew\(\);\n\s+\}\n\s+await sleep\('1 day'\);/
    );
    // listing sends no heartbeat, so only the step proxy has a heartbeatTimeout
    assert.match(
      workflow,
      /const \{ listAccountPurgeTargets \} = proxyActivities<AccountPurgeActivity>\(\{\n\s+startToCloseTimeout: '2 minute',\n\s+retry:/
    );
    assert.equal((workflow.match(/heartbeatTimeout/g) || []).length, 1);
    // a step takes a single object, so it can grow without a new activity
    assert.match(
      activity,
      /async purgeAccountStep\(\{ kind, id \}: \{ kind: AccountPurgeKind; id: string \}\)/
    );
    assert.match(activity, /return withHeartbeat\(\(\) =>/);
  });

  it('leaves every other workflow alone', () => {
    const dir = fileURLToPath(
      new URL(`${orchestrator}/workflows/`, import.meta.url)
    );
    for (const file of readdirSync(dir, { recursive: true }) as string[]) {
      if (
        !file.endsWith('.ts') ||
        file === 'account.purge.workflow.v1.ts' ||
        file === 'index.ts'
      ) {
        continue;
      }
      assert.doesNotMatch(
        read(`${orchestrator}/workflows/${file}`),
        /accountPurge|AccountPurge/,
        file
      );
    }
  });
});
