import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GmbProvider } from './gmb.provider.ts';
import { GmbSettingsDto } from '../../dtos/posts/providers-settings/gmb.settings.dto.ts';

// Captures the localPosts body instead of calling Google.
const publish = async (settings: Record<string, any>) => {
  const provider = new GmbProvider();
  let body: any;
  (provider as any).fetch = async (_url: string, init: { body: string }) => {
    body = JSON.parse(init.body);
    return { json: async () => ({ name: 'accounts/1/locations/2/localPosts/3' }) };
  };
  await provider.post('accounts/1/locations/2', 'token', [
    { id: 'post', message: 'Hello', settings, media: [] },
  ] as any);
  return body;
};

describe('Google Business event and offer dates', () => {
  const provider = new GmbProvider();

  it('requires both dates for an event', async () => {
    assert.equal(
      await provider.checkValidity([[]], {
        topicType: 'EVENT',
        eventTitle: 'Launch',
        eventStartDate: '2026-10-01',
      }),
      'Event posts require a start and an end date'
    );
  });

  it('requires a title and both dates for an offer', async () => {
    assert.equal(
      await provider.checkValidity([[]], { topicType: 'OFFER' }),
      'Offer posts require an offer title'
    );
    assert.equal(
      await provider.checkValidity([[]], {
        topicType: 'OFFER',
        eventTitle: '20% off',
        eventEndDate: '2026-10-31',
      }),
      'Offer posts require a start and an end date'
    );
    assert.equal(
      await provider.checkValidity([[]], {
        topicType: 'OFFER',
        eventTitle: '20% off',
        eventStartDate: '2026-10-01',
        eventEndDate: '2026-10-31',
      }),
      true
    );
  });

  it('sends an offer its title and schedule', async () => {
    const body = await publish({
      topicType: 'OFFER',
      eventTitle: '20% off',
      eventStartDate: '2026-10-01',
      eventEndDate: '2026-10-31',
      offerCouponCode: 'SAVE20',
    });
    assert.deepEqual(body.event, {
      title: '20% off',
      schedule: {
        startDate: { year: 2026, month: 10, day: 1 },
        endDate: { year: 2026, month: 10, day: 31 },
      },
    });
    assert.equal(body.offer.couponCode, 'SAVE20');
  });

  it('publishes an offer stored without dates exactly as before', async () => {
    const body = await publish({ topicType: 'OFFER', offerCouponCode: 'X' });
    assert.equal(body.event, undefined);
    assert.deepEqual(body.offer, { couponCode: 'X' });
  });

  it('sends no event for an offer that kept an event\'s dates but has no title', async () => {
    const body = await publish({
      topicType: 'OFFER',
      eventStartDate: '2026-10-01',
      eventEndDate: '2026-10-31',
    });
    assert.equal(body.event, undefined);
  });

  it('keeps sending an event with its times', async () => {
    const body = await publish({
      topicType: 'EVENT',
      eventTitle: 'Launch',
      eventStartDate: '2026-10-01',
      eventEndDate: '2026-10-02',
      eventStartTime: '09:30',
      eventEndTime: '17:00',
    });
    assert.deepEqual(body.event.schedule.startTime, {
      hours: 9,
      minutes: 30,
      seconds: 0,
      nanos: 0,
    });
    assert.equal(body.event.title, 'Launch');
  });
});

describe('Google Business call to action', () => {
  it('sends CALL without a url, even when an old one is stored', async () => {
    const body = await publish({
      topicType: 'STANDARD',
      callToActionType: 'CALL',
      callToActionUrl: 'https://example.com',
    });
    assert.deepEqual(body.callToAction, { actionType: 'CALL' });
  });

  it('sends a stored GET_OFFER as LEARN_MORE with its link', async () => {
    const body = await publish({
      topicType: 'STANDARD',
      callToActionType: 'GET_OFFER',
      callToActionUrl: 'https://example.com/deal',
    });
    assert.deepEqual(body.callToAction, {
      actionType: 'LEARN_MORE',
      url: 'https://example.com/deal',
    });
  });

  it('keeps the other buttons as they were', async () => {
    const body = await publish({
      topicType: 'STANDARD',
      callToActionType: 'BOOK',
      callToActionUrl: 'https://example.com/book',
    });
    assert.deepEqual(body.callToAction, {
      actionType: 'BOOK',
      url: 'https://example.com/book',
    });
    const none = await publish({ topicType: 'STANDARD', callToActionType: 'NONE' });
    assert.equal(none.callToAction, undefined);
  });

  it('sends no button on an offer, whatever was chosen before', async () => {
    const body = await publish({
      topicType: 'OFFER',
      callToActionType: 'CALL',
    });
    assert.equal(body.callToAction, undefined);
    const errors = await validate(
      plainToInstance(GmbSettingsDto, {
        topicType: 'OFFER',
        callToActionType: 'BOOK',
        callToActionUrl: 'not a url',
      }) as object,
      { skipMissingProperties: false }
    );
    assert.equal(errors.length, 0);
  });

  it('still validates a post stored with GET_OFFER', async () => {
    const errors = await validate(
      plainToInstance(GmbSettingsDto, {
        topicType: 'STANDARD',
        callToActionType: 'GET_OFFER',
        callToActionUrl: 'https://example.com',
      }) as object,
      { skipMissingProperties: false }
    );
    assert.equal(errors.length, 0);
  });
});

describe('Google Business Profile errors', () => {
  const provider = new GmbProvider();
  const google = (error: object) => provider.handleErrors(JSON.stringify({ error }));

  it('asks for a reconnect when the grant lacks a scope, before the 403 status', () => {
    const answer = google({
      code: 403,
      message: 'Request had insufficient authentication scopes.',
      status: 'PERMISSION_DENIED',
      details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', domain: 'googleapis.com' }],
    });
    assert.equal(answer?.type, 'disconnect');
    assert.match(String(answer?.value), /missing a Google permission/);
  });

  it('fails a refused profile once instead of refreshing the token in a loop', () => {
    const answer = google({
      code: 403,
      message: 'The caller does not have permission',
      status: 'PERMISSION_DENIED',
    });
    assert.equal(answer?.type, 'bad-body');
    assert.match(String(answer?.value), /verified and not suspended/);
  });

  it('reads the status, not the post text Google echoes back', () => {
    const answer = google({
      code: 400,
      status: 'INVALID_ARGUMENT',
      details: [
        {
          errorDetails: [
            { field: 'summary', value: 'UNAUTHENTICATED PERMISSION_DENIED NOT_FOUND' },
          ],
        },
      ],
    });
    assert.deepEqual(answer, {
      type: 'bad-body',
      value: 'Google refused the post because the summary field is not valid.',
    });
  });

  it('names an image Google could not download', () => {
    assert.match(
      String(
        google({
          status: 'INVALID_ARGUMENT',
          details: [{ errorDetails: [{ field: 'media.source_url' }] }],
        })?.value
      ),
      /could not download the image/
    );
    assert.equal(google({ status: 'INVALID_ARGUMENT' })?.type, 'bad-body');
  });

  it('keeps the other types as they were', () => {
    assert.equal(google({ code: 401, status: 'UNAUTHENTICATED' })?.type, 'refresh-token');
    assert.equal(google({ code: 404, status: 'NOT_FOUND' })?.type, 'bad-body');
    assert.equal(google({ code: 429, status: 'RESOURCE_EXHAUSTED' })?.type, 'bad-body');
    assert.equal(
      provider.handleErrors('{"error":"invalid_grant","error_description":"Bad Request"}')?.type,
      'refresh-token'
    );
    assert.equal(provider.handleErrors('Unauthorized')?.type, 'refresh-token');
    assert.equal(provider.handleErrors('{}'), undefined);
  });

  it('says Google Business Profile in its copy', () => {
    assert.equal(provider.name, 'Google Business Profile');
    assert.doesNotMatch(
      String(google({ status: 'UNAUTHENTICATED' })?.value),
      /My Business|account/
    );
  });
});
