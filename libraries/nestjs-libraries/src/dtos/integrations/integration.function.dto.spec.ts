import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CALLABLE_PROVIDER_FUNCTIONS,
  IntegrationFunctionDto,
} from './integration.function.dto.ts';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

const providers = files(
  join(root, 'libraries/nestjs-libraries/src/integrations/social')
)
  .filter((path) => path.endsWith('.provider.ts'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

const frontend = files(join(root, 'apps/frontend/src'))
  .filter((path) => /\.tsx?$/.test(path))
  .map((path) => readFileSync(path, 'utf8'));

const refused = async (name: string) =>
  (
    await validate(
      plainToInstance(IntegrationFunctionDto, { id: 'channel', name })
    )
  ).some((error) => error.property === 'name');

describe('Provider methods the app may call by name', () => {
  it('refuses everything that is not a lookup a settings component calls', async () => {
    for (const name of [
      'getClient',
      'signOAuth1',
      'post',
      'postPending',
      'comment',
      'analytics',
      'refreshToken',
      'authenticate',
      'autoRepostPost',
      'constructor',
    ]) {
      assert.equal(await refused(name), true, name);
    }
    for (const name of CALLABLE_PROVIDER_FUNCTIONS) {
      assert.equal(await refused(name), false, name);
    }
  });

  it('lists only methods a provider has', () => {
    for (const name of CALLABLE_PROVIDER_FUNCTIONS) {
      assert.match(
        providers,
        new RegExp(`\\b(?:async\\s+)?${name}\\s*(?:=\\s*async\\s*)?\\(`),
        name
      );
    }
  });

  it('lists every method the app calls', () => {
    const called = new Set<string>();
    for (const source of frontend) {
      if (
        !/useCustomProviderFunction|integrations\/function|integrations\/mentions|withContinueProvider/.test(
          source
        )
      ) {
        continue;
      }
      for (const pattern of [
        /\bget\(\s*['"`]([A-Za-z]+)['"`]/g,
        /\bendpoint:\s*['"]([A-Za-z]+)['"]/g,
        /\bfunc="([A-Za-z]+)"/g,
        /\bname:\s*['"]([A-Za-z]+)['"],\s*\n\s*data:/g,
        /\bname:\s*'mention'/g,
      ]) {
        for (const match of source.matchAll(pattern)) {
          called.add(match[1] || 'mention');
        }
      }
    }
    // Continue providers and WordPress pass their names through props.
    for (const source of frontend) {
      for (const match of source.matchAll(/\bfunc="([A-Za-z]+)"/g)) {
        called.add(match[1]);
      }
      for (const match of source.matchAll(/\bendpoint:\s*'([A-Za-z]+)'/g)) {
        called.add(match[1]);
      }
    }
    assert.ok(called.size >= 20, `found only ${[...called].join(', ')}`);
    for (const name of called) {
      assert.ok(CALLABLE_PROVIDER_FUNCTIONS.includes(name), name);
    }
  });
});
