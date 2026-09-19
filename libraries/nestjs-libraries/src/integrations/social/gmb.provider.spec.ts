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
