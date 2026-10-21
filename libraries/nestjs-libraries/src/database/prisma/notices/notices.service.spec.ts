import 'reflect-metadata';
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import {
  EmailContent,
  readEmailContent,
} from '../../../emails/email.content.ts';

let NoticesService: any;
let noticeEmailWorkflowId: (noticeKey: string, userId: string) => string;
let pendingNoticeRecipients: any;
let UsersRepository: any;
let EmailService: any;
before(async () => {
  ({ NoticesService, noticeEmailWorkflowId, pendingNoticeRecipients } =
    await import('./notices.service.ts'));
  ({ UsersRepository } = await import('../users/users.repository.ts'));
  ({ EmailService } = await import('../../../services/email.service.ts'));
});

const body = (dryRun: boolean) => ({
  noticeKey: 'terms-2026-11',
  subject: 'Our Terms are changing',
  content: {
    category: 'Terms update',
    preheader: 'Our Terms change on 1 December.',
    title: 'Our Terms are changing',
    blocks: [{ type: 'text', text: 'Here is what changes.' }],
  },
  dryRun,
});

const alreadyStarted = () =>
  Object.assign(new Error('Workflow execution already started'), {
    name: 'WorkflowExecutionAlreadyStartedError',
  });

let users: { id: string; email: string }[];
let delivered: { userId: string; user: { email: string } }[];
let starts: { type: string; options: any }[];
// Workflow ids Temporal has seen, and how each run ended.
let existing: Map<string, 'running' | 'completed' | 'failed'>;
let recorded: string[];
let accepted: boolean;
let refused: boolean;
let recordFails: boolean;
let sends: number;

// Every collaborator faked: the users and deliveries are lists, Temporal
// remembers the workflow ids it was handed and applies the id reuse policy,
// and the provider accepts or not.
const service = () =>
  new NoticesService(
    {
      listDeliveries: async () => delivered,
      wasDelivered: async (_key: string, userId: string, email: string) =>
        delivered.some(
          (d) =>
            d.userId === userId ||
            d.user.email.toLowerCase() === email.toLowerCase()
        ),
      recordDelivery: async (_key: string, userId: string) => {
        if (recordFails) {
          throw new Error('database is down');
        }
        recorded.push(userId);
      },
    },
    {
      listNoticeRecipients: async () => users,
      getNoticeRecipient: async (id: string) =>
        users.find((u) => u.id === id) || null,
    },
    {
      hasProvider: () => true,
      deliverEmail: async () => {
        sends += 1;
        return { accepted, refused };
      },
    },
    {
      client: {
        getRawClient: () => ({
          workflow: {
            start: async (type: string, options: any) => {
              const run = existing.get(options.workflowId);
              const reusable =
                run === 'failed' &&
                options.workflowIdReusePolicy === 'ALLOW_DUPLICATE_FAILED_ONLY';
              if (run && !reusable) {
                throw alreadyStarted();
              }
              existing.set(options.workflowId, 'running');
              starts.push({ type, options });
            },
          },
        }),
      },
    }
  );

beforeEach(() => {
  users = [
    { id: 'u3', email: 'Ada@Example.com' },
    { id: 'u1', email: 'grace@example.com' },
    { id: 'u2', email: 'ada@example.com' },
    { id: 'u4', email: 'linus@example.com' },
  ];
  delivered = [];
  starts = [];
  existing = new Map();
  recorded = [];
  accepted = true;
  refused = false;
  recordFails = false;
  sends = 0;
});

describe('who gets a notice', () => {
  it('asks only for live, activated accounts with an address, ids and emails only', async () => {
    let args: any;
    const repository = new UsersRepository(
      {
        model: {
          user: {
            findMany: async (query: any) => {
              args = query;
              return [];
            },
          },
        },
      },
      {},
      {}
    );
    await repository.listNoticeRecipients();
    assert.deepEqual(args.where, {
      deletedAt: null,
      purgedAt: null,
      activated: true,
      email: { contains: '@' },
    });
    assert.deepEqual(args.select, { id: true, email: true });
    assert.deepEqual(args.orderBy, [{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('sends one email per address, to its oldest account, in id order', () => {
    assert.deepEqual(
      pendingNoticeRecipients(users, []).map((u: any) => u.id),
      ['u1', 'u3', 'u4']
    );
  });

  it('leaves out the accounts and the addresses it already reached', () => {
    const pending = pendingNoticeRecipients(users, [
      { userId: 'u1', user: { email: 'grace@example.com' } },
      // another account at the address, delivered by an earlier run
      { userId: 'u9', user: { email: 'ADA@example.com' } },
    ]);
    assert.deepEqual(
      pending.map((u: any) => u.id),
      ['u4']
    );
  });
});

describe('POST /admin/notices', () => {
  it('only counts on a dry run', async () => {
    const result = await service().sendNotice(body(true));
    assert.deepEqual(result, { recipients: 3, started: false });
    assert.equal(starts.length, 0);
  });

  it('counts what is still to send', async () => {
    delivered = [{ userId: 'u4', user: { email: 'linus@example.com' } }];
    assert.deepEqual(await service().sendNotice(body(true)), {
      recipients: 2,
      started: false,
    });
  });

  it('starts one fan-out per notice, carrying the legal email', async () => {
    const notices = service();
    assert.deepEqual(await notices.sendNotice(body(false)), {
      recipients: 3,
      started: true,
    });
    assert.equal(starts.length, 1);
    const [{ type, options }] = starts;
    assert.equal(type, 'sendNoticeWorkflowV1');
    assert.equal(options.workflowId, 'notice:terms-2026-11');
    const content = readEmailContent(options.args[0].html) as EmailContent;
    assert.equal(content.footer, 'legal');
    assert.equal(content.stream, 'account');
    assert.equal(content.title, 'Our Terms are changing');

    // a second request while it runs starts nothing
    assert.deepEqual(await notices.sendNotice(body(false)), {
      recipients: 3,
      started: false,
    });
    assert.equal(starts.length, 1);
  });

  it('refuses an email that does not render', async () => {
    const broken = body(true);
    broken.content.blocks = [{ type: 'rows' } as any];
    await assert.rejects(service().sendNotice(broken), /does not render/);
  });
});

describe('the fan-out', () => {
  const batch = { noticeKey: 'terms-2026-11', subject: 's', html: 'h' };

  it('names each email workflow after the notice and the account', () => {
    assert.equal(
      noticeEmailWorkflowId('terms-2026-11', 'u1'),
      'notice:terms-2026-11:u1'
    );
  });

  it('starts each account once, with ALLOW_DUPLICATE_FAILED_ONLY, page by page', async () => {
    const notices = service();
    const first = await notices.startNoticeBatch({ ...batch, limit: 2 });
    assert.deepEqual(first, { started: 2, skipped: 0, next: 'u3' });
    const second = await notices.startNoticeBatch({
      ...batch,
      after: first.next,
      limit: 2,
    });
    assert.deepEqual(second, { started: 1, skipped: 0, next: undefined });

    assert.deepEqual(
      starts.map((s) => s.options.workflowId),
      [
        'notice:terms-2026-11:u1',
        'notice:terms-2026-11:u3',
        'notice:terms-2026-11:u4',
      ]
    );
    for (const { type, options } of starts) {
      assert.equal(type, 'sendNoticeEmailWorkflowV1');
      assert.equal(
        options.workflowIdReusePolicy,
        'ALLOW_DUPLICATE_FAILED_ONLY'
      );
      // no address in the workflow: it is read when the email is sent
      assert.deepEqual(Object.keys(options.args[0]).sort(), [
        'html',
        'noticeKey',
        'subject',
        'userId',
      ]);
    }
  });

  it('skips an account whose workflow already exists, so a re-run sends no copy', async () => {
    const notices = service();
    await notices.startNoticeBatch({ ...batch, limit: 10 });
    const again = await notices.startNoticeBatch({ ...batch, limit: 10 });
    assert.deepEqual(again, { started: 0, skipped: 3, next: undefined });
    assert.equal(starts.length, 3);
  });

  it('starts a failed account again on a re-run, and none that sent or still runs', async () => {
    const notices = service();
    await notices.startNoticeBatch({ ...batch, limit: 10 });
    existing.set('notice:terms-2026-11:u1', 'failed');
    existing.set('notice:terms-2026-11:u3', 'completed');
    const again = await notices.startNoticeBatch({ ...batch, limit: 10 });
    assert.deepEqual(again, { started: 1, skipped: 2, next: undefined });
    assert.equal(starts.at(-1)!.options.workflowId, 'notice:terms-2026-11:u1');
  });
});

describe('one account’s email', () => {
  const email = (userId: string) => ({
    noticeKey: 'terms-2026-11',
    userId,
    subject: 's',
    html: 'h',
  });

  it('records the proof once the provider accepted it', async () => {
    assert.deepEqual(await service().sendNoticeEmail(email('u1')), {
      sent: true,
    });
    assert.deepEqual(recorded, ['u1']);
  });

  it('throws for a retry when the email never reached the provider, and records nothing', async () => {
    accepted = false;
    await assert.rejects(service().sendNoticeEmail(email('u1')), /not accepted/);
    assert.deepEqual(recorded, []);
  });

  it('does not retry an address the provider refused', async () => {
    accepted = false;
    refused = true;
    assert.deepEqual(await service().sendNoticeEmail(email('u1')), {
      sent: false,
    });
    assert.deepEqual(recorded, []);
  });

  it('does not throw when the proof cannot be written, since a retry would send again', async () => {
    recordFails = true;
    assert.deepEqual(await service().sendNoticeEmail(email('u1')), {
      sent: true,
    });
    assert.equal(sends, 1);
  });

  it('sends nothing to an address that already has it, or an account that is gone', async () => {
    delivered = [{ userId: 'u3', user: { email: 'ada@example.com' } }];
    assert.deepEqual(await service().sendNoticeEmail(email('u2')), {
      sent: false,
    });
    assert.deepEqual(await service().sendNoticeEmail(email('gone')), {
      sent: false,
    });
    assert.equal(sends, 0);
  });
});

describe('the legal email on the wire', () => {
  it('carries no List-Unsubscribe headers', () => {
    const keys = ['FRONTEND_URL', 'NEXT_PUBLIC_BACKEND_URL', 'JWT_SECRET'];
    const previous = keys.map((key) => process.env[key]);
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com';
    process.env.JWT_SECRET = 'spec-secret';
    try {
      const emails = new EmailService({});
      const unsubscribe = (kind: EmailContent['footer']) =>
        emails.unsubscribe('ada@example.com', { footer: kind });
      assert.equal(unsubscribe('legal'), undefined);
      // while an email Settings can turn off has them
      assert.ok(unsubscribe('failure')?.headers?.['List-Unsubscribe']);
    } finally {
      keys.forEach((key, i) => {
        if (previous[i] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[i];
        }
      });
    }
  });
});
