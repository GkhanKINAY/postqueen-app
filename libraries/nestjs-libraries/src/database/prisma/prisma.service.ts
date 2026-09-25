import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
} from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

const TOKEN_FIELDS = ['token', 'refreshToken'] as const;

// ENCRYPT_INTEGRATION_TOKENS=false stores new tokens as issued, and the boot
// sync (IntegrationService.onModuleInit) writes the stored ones back the same
// way. It is the step before running an image older than this change, which
// cannot read the encrypted format. Reads decrypt either way.
export const integrationTokenEncryptionEnabled = () =>
  process.env.ENCRYPT_INTEGRATION_TOKENS !== 'false';

function encryptTokenFields(row: any) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  const out = { ...row };
  for (const field of TOKEN_FIELDS) {
    const value = out[field];
    if (typeof value === 'string') {
      out[field] = AuthService.encryptToken(value);
    } else if (value && typeof value.set === 'string') {
      out[field] = { ...value, set: AuthService.encryptToken(value.set) };
    }
  }
  return out;
}

/**
 * Channel OAuth tokens are encrypted in the database and plain everywhere
 * else (AuthService.encryptToken). Doing it here, on the client every
 * repository shares, covers each write and each read, including an
 * integration included from a post, without any caller knowing: provider and
 * workflow code, ours and upstream's, keeps using `integration.token`.
 */
const integrationTokenEncryption = Prisma.defineExtension({
  name: 'integration-token-encryption',
  query: {
    integration: {
      $allOperations({ args, query }) {
        if (!integrationTokenEncryptionEnabled()) {
          return query(args);
        }
        const write = args as any;
        return query({
          ...write,
          ...(write.data
            ? {
                data: Array.isArray(write.data)
                  ? write.data.map(encryptTokenFields)
                  : encryptTokenFields(write.data),
              }
            : {}),
          ...(write.create ? { create: encryptTokenFields(write.create) } : {}),
          ...(write.update ? { update: encryptTokenFields(write.update) } : {}),
        });
      },
    },
  },
  result: {
    integration: {
      token: {
        needs: { token: true },
        compute: ({ token }) => AuthService.decryptToken(token),
      },
      refreshToken: {
        needs: { refreshToken: true },
        compute: ({ refreshToken }) =>
          refreshToken ? AuthService.decryptToken(refreshToken) : refreshToken,
      },
    },
  },
});

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Prisma 7 dropped the Rust query engine, so the connection no longer
      // comes from `url` in the schema — the client is handed a driver instead.
      // This is the only place a PrismaClient is constructed; everything else
      // in the codebase imports types from the generated client.
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      log: [
        {
          emit: 'event',
          level: 'query',
        },
      ],
    });

    // Nest injects whatever the constructor returns, so every repository and
    // transaction gets the extended client.
    return this.$extends(integrationTokenEncryption) as unknown as this;
  }
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Injectable()
export class PrismaRepository<T extends keyof PrismaService> {
  public model: Pick<PrismaService, T>;
  constructor(private _prismaService: PrismaService) {
    this.model = this._prismaService;
  }
}

@Injectable()
export class PrismaTransaction {
  public model: Pick<PrismaService, '$transaction'>;
  constructor(private _prismaService: PrismaService) {
    this.model = this._prismaService;
  }
}
