import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  INestApplication,
  Logger,
  Module,
  Post,
  Req,
  UnprocessableEntityException,
  UseInterceptors,
} from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { Request } from 'express';
import { lastValueFrom, throwError } from 'rxjs';
import {
  spendThrottlerHits,
  ThrottlerBehindProxyGuard,
  ThrottlerRealIpGuard,
  ThrottlerRefundInterceptor,
} from './throttler.provider.ts';
import { MemoryThrottlerStorage } from './throttler.storage.ts';

// The guard keys on `req.ip`; which address that is, and why a client cannot
// pick it, is Express `trust proxy`, covered in user/client.ip.spec.ts.
const tracker = (req: Record<string, any>) =>
  (
    new ThrottlerRealIpGuard({} as any, {} as any, {} as any) as any
  ).getTracker(req) as Promise<string>;

describe('ThrottlerRealIpGuard', () => {
  it('keys on the resolved client address', async () => {
    assert.equal(
      await tracker({
        headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 172.19.0.1' },
        ip: '203.0.113.9',
      }),
      '203.0.113.9'
    );
  });

  it('does not read X-Forwarded-For itself', async () => {
    // Neither the first entry (the client's) nor the last (our Docker
    // gateway) may become the bucket.
    assert.equal(
      await tracker({
        headers: { 'x-forwarded-for': '6.6.6.6, 172.19.0.1' },
        ip: '198.51.100.4',
      }),
      '198.51.100.4'
    );
  });
});

// The guard and the interceptor in a real Nest app, in front of a handler
// that answers whatever the request asks for.
@Controller('/public/v1')
class PostsController {
  @Post('/posts')
  @UseInterceptors(ThrottlerRefundInterceptor)
  createPost(@Body() body: { answer: string }, @Req() req: Request) {
    if (body.answer === 'invalid') {
      throw new BadRequestException('invalid');
    }
    if (body.answer === 'unprocessable') {
      throw new UnprocessableEntityException('unprocessable');
    }
    if (body.answer === 'forbidden') {
      throw new ForbiddenException();
    }
    spendThrottlerHits(req);
    if (body.answer === 'saved-then-invalid') {
      throw new BadRequestException('the second channel');
    }
    return { ok: true };
  }
}

describe('ThrottlerRefundInterceptor', () => {
  let app: INestApplication;
  let url: string;

  beforeEach(async () => {
    @Module({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 3600000, limit: 3 }],
          storage: new MemoryThrottlerStorage(),
        }),
      ],
      controllers: [PostsController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard }],
    })
    class TestModule {}

    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/public/v1/posts`;
  });

  afterEach(() => app.close());

  const post = async (answer: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
    return {
      status: res.status,
      remaining: res.headers.get('x-ratelimit-remaining'),
    };
  };

  it('does not spend the allowance on a 400 or a 422', async () => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await post('invalid')).status, 400);
      assert.equal((await post('unprocessable')).status, 422);
    }

    assert.deepEqual(await post('ok'), { status: 201, remaining: '2' });
  });

  it('spends it on a post that went through', async () => {
    assert.deepEqual(await post('ok'), { status: 201, remaining: '2' });
    assert.deepEqual(await post('ok'), { status: 201, remaining: '1' });
    assert.deepEqual(await post('ok'), { status: 201, remaining: '0' });
    assert.equal((await post('ok')).status, 429);
    // Refused by the limit itself, before the handler: nothing to give back.
    assert.equal((await post('invalid')).status, 429);
  });

  it('spends it on any other refusal', async () => {
    assert.equal((await post('forbidden')).status, 403);
    assert.deepEqual(await post('ok'), { status: 201, remaining: '1' });
  });

  it('spends it once the handler has said so', async () => {
    assert.equal((await post('saved-then-invalid')).status, 400);
    assert.deepEqual(await post('ok'), { status: 201, remaining: '1' });
  });

  it("answers with the request's own error when the refund fails", async (t) => {
    const warn = t.mock.method(Logger.prototype, 'warn', () => undefined);
    const interceptor = new ThrottlerRefundInterceptor({
      decrement: () => {
        throw new Error('Redis is down');
      },
    } as any);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          throttlerHits: [{ key: 'org_posts', throttlerName: 'default' }],
        }),
      }),
    } as any;
    const refused = new BadRequestException('invalid');

    await assert.rejects(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => refused),
        })
      ),
      (err) => err === refused
    );
    assert.equal(warn.mock.callCount(), 1);
  });
});
