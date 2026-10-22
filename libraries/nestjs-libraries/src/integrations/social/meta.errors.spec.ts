import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FacebookProvider } from './facebook.provider.ts';
import { InstagramProvider } from './instagram.provider.ts';
import { InstagramStandaloneProvider } from './instagram.standalone.provider.ts';
import { ThreadsProvider } from './threads.provider.ts';
import { BadBody } from '../social.abstract.ts';

// A Graph error body, as Meta sends it.
const graph = (error: Record<string, unknown>, extra = {}) =>
  JSON.stringify({
    error: { type: 'OAuthException', fbtrace_id: 'AbC123xYz', ...error },
    ...extra,
  });

const images = (count: number, ext = 'jpg') =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.${ext}` }));

// Both Instagram tiles measure feed photos through InstagramProvider, which
// reads the file with sharp. Every photo here measures as `size` says.
let size: { width: number; height: number; orientation?: number } | undefined =
  { width: 1080, height: 1080 };
let measured = 0;
(InstagramProvider.prototype as any).getImageDimensions = async () => {
  measured++;
  if (!size) {
    throw new Error('Input buffer contains unsupported image format');
  }
  return size;
};

const facebook = new FacebookProvider();
const instagram = new InstagramProvider();
const standalone = new InstagramStandaloneProvider();
const igTiles = [
  ['Facebook login', instagram],
  ['standalone', standalone],
] as const;

describe('Facebook error mapping', () => {
  it('asks for the security check, not a new token, on a checkpoint', () => {
    for (const subcode of [459, 464, 490]) {
      assert.deepEqual(
        facebook.handleErrors(
          graph({
            message:
              'Error validating access token: You cannot access the app till you log in to www.facebook.com and follow the instructions given.',
            code: 190,
            error_subcode: subcode,
          }),
          400
        ),
        {
          type: 'bad-body',
          value:
            'Facebook has put a security check on your account. Log in at facebook.com, complete it, then try again.',
        },
        String(subcode)
      );
    }
  });

  it('still asks for a new token when the session expired', () => {
    assert.equal(
      facebook.handleErrors(
        graph({
          message: 'Error validating access token: Session has expired',
          code: 190,
          error_subcode: 463,
        }),
        400
      )?.type,
      'refresh-token'
    );
  });

  it('no longer reads 490 inside an id or a trace id as an expired token', () => {
    const body = graph(
      { message: '(#100) Invalid parameter', code: 100, fbtrace_id: 'Ax490Bz' },
      { id: '104904901234' }
    );
    assert.equal(facebook.handleErrors(body, 400), undefined);
  });

  it('matches a subcode only as a whole number', () => {
    assert.equal(
      facebook.handleErrors(graph({ message: 'x', code: 100 }, { id: '913660461' }), 400),
      undefined
    );
    assert.equal(
      facebook.handleErrors(graph({ message: 'x', code: 1, error_subcode: 1366046 }), 400)?.value,
      'Photos should be smaller than 4 MB and saved as JPG, PNG'
    );
  });

  it('warns that the post may be live after a temporary failure', () => {
    for (const subcode of [1363047, 1609010]) {
      assert.deepEqual(
        facebook.handleErrors(graph({ message: 'x', code: 1, error_subcode: subcode }), 500),
        {
          type: 'bad-body',
          value:
            'Facebook had a temporary problem. Check your Page first, the post may already be live, then try again.',
        }
      );
    }
  });
});

describe('Facebook media mix', () => {
  const check = (paths: string[], post_type = 'post') =>
    facebook.checkValidity([paths.map((path) => ({ path }))], { post_type });

  it('takes several photos, or one video', async () => {
    assert.equal(await check(['a.jpg', 'b.png', 'c.jpg']), true);
    assert.equal(await check(['a.mp4']), true);
  });

  it('refuses photos and a video together, or two videos', async () => {
    const message = 'Facebook posts can have several photos or one video, not both.';
    assert.equal(await check(['a.mp4', 'b.jpg']), message);
    assert.equal(await check(['a.jpg', 'b.mp4']), message);
    assert.equal(await check(['a.mp4', 'b.mp4']), message);
  });

  it('lets a story mix them, since each item is its own story', async () => {
    assert.equal(await check(['a.mp4', 'b.jpg'], 'story'), true);
  });
});

describe('Instagram error mapping', () => {
  const handle = (body: string, status = 400) => instagram.handleErrors(body, status);

  it('asks for a reconnect on code 190', () => {
    assert.deepEqual(
      handle(
        graph({
          message: 'Error validating access token: Session has expired',
          code: 190,
          error_subcode: 463,
        })
      ),
      {
        type: 'refresh-token',
        value: "Instagram ended this channel's session. Please reconnect the channel.",
      }
    );
  });

  it('names the usual causes when the session was invalidated', () => {
    assert.deepEqual(
      handle(
        graph({
          message:
            'Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.',
          code: 190,
          error_subcode: 460,
        })
      ),
      {
        type: 'refresh-token',
        value:
          'Your Instagram session ended, usually after a password change or a security check. Please reconnect the channel.',
      }
    );
  });

  it('does not read 190 inside an id as a token error', () => {
    assert.equal(
      handle(graph({ message: 'x', code: 100 }, { ids: [17841400190, 17841400191] })),
      undefined
    );
  });

  it('does not read a subcode inside a longer id', () => {
    assert.equal(
      handle(graph({ message: 'x', code: 100 }, { id: '17922070011234' })),
      undefined
    );
  });

  it('retries the errors Meta documents as temporary', () => {
    for (const subcode of [2207001, 2207003, 2207008, 2207027, 2207032]) {
      assert.equal(
        handle(graph({ message: 'x', code: -2, error_subcode: subcode }))?.type,
        'retry',
        String(subcode)
      );
    }
    assert.equal(
      handle(graph({ message: 'x', code: -2, error_subcode: 2207001 }))?.value,
      'Instagram had a temporary server problem. Please try again in a few minutes.'
    );
    assert.equal(
      handle(graph({ message: 'x', code: 9007, error_subcode: 2207027 }))?.value,
      'Instagram is still processing the media. Please try again in a minute.'
    );
  });

  it('keeps a failed download as a plain error', () => {
    assert.deepEqual(handle(graph({ message: 'x', code: -1, error_subcode: 2207052 })), {
      type: 'bad-body',
      value:
        'Instagram could not download the media file. Please try again. If it keeps failing, upload the file again.',
    });
  });

  it('reads a subcode from a failed container status too', () => {
    assert.equal(
      handle('Error: Media upload has failed with error code 2207026', 200)?.value,
      'Unsupported video format'
    );
  });

  it('keeps subcode 33 as a reconnect, and only for 33', () => {
    const body = graph({
      message: "Unsupported post request. Object with ID '1784' does not exist",
      type: 'GraphMethodException',
      code: 100,
      error_subcode: 33,
    });
    assert.equal(handle(body)?.type, 'refresh-token');
    assert.equal(handle(graph({ message: 'x', code: 100, error_subcode: 330 })), undefined);
  });

  it('explains the photo ratio for 2207009 and code 36003', () => {
    const value =
      'Instagram feed photos must be between 4:5 and 1.91:1. Crop the photo or post it as a story.';
    assert.equal(handle(graph({ message: 'x', code: 36003, error_subcode: 2207009 }))?.value, value);
    assert.equal(handle(graph({ message: 'x', code: 36003 }))?.value, value);
  });

  it('says what each limit is', () => {
    const value = (subcode: number) =>
      handle(graph({ message: 'x', code: 100, error_subcode: subcode }))?.value;
    assert.equal(value(2207004), 'Instagram images must be 8 MB or smaller.');
    assert.equal(
      value(2207010),
      'Instagram captions allow 2,200 characters, 30 hashtags and 20 @ tags.'
    );
    assert.equal(value(2207040), 'Instagram allows up to 20 @ tags per post.');
    assert.equal(
      value(2207050),
      'Instagram has restricted this account. Open the Instagram app, complete any steps it shows, then try again.'
    );
    assert.equal(
      handle(
        graph({
          message: 'The carousel has too little or too many attachments',
          code: 100,
        })
      )?.value,
      'An Instagram carousel needs 2 to 20 photos or videos.'
    );
  });

  it('answers a known subcode before the generic unknown error', () => {
    assert.equal(
      handle(graph({ message: 'An unknown error occurred', code: 1, error_subcode: 2207050 }))
        ?.type,
      'bad-body'
    );
    assert.equal(
      handle(graph({ message: 'An unknown error occurred', code: 1 }))?.type,
      'retry'
    );
  });

  it('names the rate limit, and only for the rate limit codes', () => {
    for (const code of [4, 17, 341, 613, 80002]) {
      assert.deepEqual(
        handle(graph({ message: 'Application request limit reached', code })),
        {
          type: 'bad-body',
          value:
            'Meta is limiting requests for this channel right now. Wait an hour, then try again.',
        },
        String(code)
      );
    }
    assert.equal(handle(graph({ message: 'x', code: 40 })), undefined);
  });

  it('points the standalone tile at its own permissions, not a Page', () => {
    const body = graph({ message: '(#200) Permissions error', code: 200 });
    assert.match(String(instagram.handleErrors(body, 403)?.value), /Page linked to this Instagram account/);
    assert.deepEqual(standalone.handleErrors(body, 403), {
      type: 'bad-body',
      value:
        'Instagram rejected the post because a permission is missing. Please reconnect the channel and allow all permissions.',
    });
  });
});

describe('Instagram carousel and photo shape, on both tiles', () => {
  for (const [name, provider] of igTiles) {
    it(`${name}: takes a carousel of up to 20 items`, async () => {
      size = { width: 1080, height: 1080 };
      assert.equal(await provider.checkValidity([images(20)], { post_type: 'post' }, []), true);
      assert.equal(
        await provider.checkValidity([images(21)], { post_type: 'post' }, []),
        'Instagram carousels can have up to 20 photos or videos'
      );
    });

    it(`${name}: takes feed photos from 4:5 to 1.91:1`, async () => {
      for (const s of [
        { width: 1080, height: 1350 },
        { width: 1080, height: 1080 },
        { width: 1200, height: 628 },
      ]) {
        size = s;
        assert.equal(
          await provider.checkValidity([images(1)], { post_type: 'post' }, []),
          true,
          `${s.width}x${s.height}`
        );
      }
    });

    it(`${name}: refuses a feed photo outside 4:5 to 1.91:1`, async () => {
      size = { width: 1080, height: 1920 };
      assert.equal(
        await provider.checkValidity([images(1)], { post_type: 'post' }, []),
        'Image 1 is 1080x1920. Instagram feed photos must be between 4:5 and 1.91:1. Crop the photo or post it as a story.'
      );
    });

    it(`${name}: measures a photo the way its EXIF orientation shows it`, async () => {
      // stored 1920x1080, shown 1080x1920
      size = { width: 1920, height: 1080, orientation: 6 };
      assert.equal(
        await provider.checkValidity([images(1)], { post_type: 'post' }, []),
        'Image 1 is 1080x1920. Instagram feed photos must be between 4:5 and 1.91:1. Crop the photo or post it as a story.'
      );
      // stored 1080x1920, shown 1920x1080 (1.78:1)
      size = { width: 1080, height: 1920, orientation: 8 };
      assert.equal(
        await provider.checkValidity([images(1)], { post_type: 'post' }, []),
        true
      );
      // mirrored only, not turned
      size = { width: 1080, height: 1350, orientation: 2 };
      assert.equal(
        await provider.checkValidity([images(1)], { post_type: 'post' }, []),
        true
      );
    });

    it(`${name}: leaves a photo it cannot read for Instagram to judge`, async () => {
      size = undefined;
      assert.equal(
        await provider.checkValidity([images(1)], { post_type: 'post' }, []),
        true
      );
    });

    it(`${name}: does not measure stories, reels or videos`, async () => {
      size = { width: 1080, height: 1920 };
      measured = 0;
      assert.equal(await provider.checkValidity([images(2)], { post_type: 'story' }, []), true);
      assert.equal(await provider.checkValidity([images(1, 'mp4')], { post_type: 'reel' }, []), true);
      assert.equal(await provider.checkValidity([images(1, 'mp4')], { post_type: 'post' }, []), true);
      assert.equal(measured, 0);
    });
  }
});

describe('Threads container errors', () => {
  const failWith = async (error_message?: string) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: 'ERROR', error_message }), {
        status: 200,
      })) as typeof fetch;
    try {
      await new ThreadsProvider().checkPostStatus(
        'token',
        { step: 'container', containerId: 'c1' },
        {} as any
      );
      return '';
    } catch (err) {
      assert.ok(err instanceof BadBody);
      return (err as Error).message;
    } finally {
      globalThis.fetch = original;
    }
  };

  it('explains the documented values', async () => {
    assert.equal(await failWith('INVALID_DURATION'), 'Threads videos can be up to 5 minutes long.');
    assert.equal(await failWith('INVALID_FRAME_RATE'), 'Threads videos need 23 to 60 FPS.');
    assert.match(await failWith('INVALID_BIT_RATE'), /above 100 Mbps/);
    assert.match(await failWith('INVALID_AUDIO_CHANNELS'), /Use AAC audio, mono or stereo/);
    assert.match(await failWith('FAILED_PROCESSING_VIDEO'), /Please try again/);
  });

  it('keeps an unknown value inside a sentence', async () => {
    assert.equal(
      await failWith('SOMETHING_NEW'),
      'Threads could not process the media (SOMETHING_NEW). Please check the media format and try again.'
    );
    assert.equal(
      await failWith('UNKNOWN'),
      'Threads could not process the media, please check the media format and try again'
    );
  });
});
