import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DribbbleProvider } from './dribbble.provider.ts';
import { DribbbleDto } from '../../dtos/posts/providers-settings/dribbble.dto.ts';

// The text fields of the multipart body, in the order they were appended.
const fields = (form: any) =>
  (form._streams as unknown[])
    .filter((part): part is string => typeof part === 'string')
    .join('');

const publish = async (settings: Record<string, any>) => {
  const provider = new DribbbleProvider();
  let form: any;
  (provider as any).getSsrfSafeAxios = () => ({
    get: async () => ({ data: Readable.from(['x']), status: 200 }),
    post: async (_url: string, body: any) => {
      form = body;
      return { headers: { location: 'https://dribbble.com/shots/99' } };
    },
  });
  await provider.post('id', 'token', [
    {
      id: 'post',
      message: 'Description',
      settings,
      media: [{ type: 'image', path: 'https://cdn.test/shot.png' }],
    },
  ] as any);
  return fields(form);
};

describe('Dribbble team', () => {
  const errorsFor = (team?: string) =>
    validate(plainToInstance(DribbbleDto, { title: 'Shot', team }) as object, {
      skipMissingProperties: false,
    });

  it('accepts the id the picker stores, and the empty choice', async () => {
    assert.equal((await errorsFor('123456')).length, 0);
    assert.equal((await errorsFor('')).length, 0);
    assert.equal((await errorsFor(undefined)).length, 0);
  });

  it('is sent as team_id', async () => {
    assert.match(
      await publish({ title: 'Shot', team: '123456' }),
      /name="team_id"\r\n\r\n123456$/
    );
  });

  it('is left out when empty or not an id, as before', async () => {
    assert.ok(!(await publish({ title: 'Shot', team: '' })).includes('team_id'));
    assert.ok(!(await publish({ title: 'Shot' })).includes('team_id'));
    assert.ok(
      !(await publish({ title: 'Shot', team: 'https://dribbble.com/team' })).includes(
        'team_id'
      )
    );
  });
});
