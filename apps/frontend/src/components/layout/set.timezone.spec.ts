import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

// The machine is in Istanbul (UTC+3, no DST) and the user picks New York,
// whose clocks go back an hour at 02:00 on 2026-11-01 and forward at 02:00
// on 2026-03-08. Set before dayjs is loaded, so every Date in this process
// reads the Istanbul wall clock.
process.env.TZ = 'Europe/Istanbul';

type Module = typeof import('./set.timezone');
let tz: Module;
let dayjs: typeof import('dayjs');

const UTC = 'YYYY-MM-DDTHH:mm:ss';

before(async () => {
  dayjs = (await import('dayjs')).default;
  tz = await import('./set.timezone');
});

describe('set.timezone without a chosen timezone', () => {
  before(() => tz.setUserTimezone(null));

  it('newDayjs is plain dayjs', () => {
    for (const input of [
      '2026-11-01 10:00',
      '2026-11-01T10:00:00Z',
      '2026-11-01',
      1793534400000,
    ]) {
      const ours = tz.newDayjs(input);
      const plain = dayjs(input);
      assert.equal(ours.valueOf(), plain.valueOf());
      assert.equal(ours.format(), plain.format());
    }
    assert.ok(Math.abs(tz.newDayjs().valueOf() - Date.now()) < 1000);
  });

  it('fromUtc is utc().local()', () => {
    const ours = tz.fromUtc('2026-11-01T15:00:00');
    const plain = dayjs.utc('2026-11-01T15:00:00').local();
    assert.equal(ours.valueOf(), plain.valueOf());
    assert.equal(ours.format('YYYY-MM-DD HH:mm'), '2026-11-01 18:00');
  });

  it('dates show in the browser timezone', () => {
    assert.equal(tz.getTimezone(), 'Europe/Istanbul');
    assert.equal(
      tz.newDayjs('2026-11-01 10:00').utc().format(UTC),
      '2026-11-01T07:00:00',
    );
  });
});

describe('set.timezone with America/New_York chosen', () => {
  before(() => tz.setUserTimezone('America/New_York'));

  it('reads a wall clock in the chosen timezone', () => {
    assert.equal(tz.getTimezone(), 'America/New_York');
    // daylight time the day before the change, standard time on the day
    assert.equal(
      tz.newDayjs('2026-10-31 10:00').utc().format(UTC),
      '2026-10-31T14:00:00',
    );
    assert.equal(
      tz.newDayjs('2026-11-01 10:00').utc().format(UTC),
      '2026-11-01T15:00:00',
    );
    assert.equal(tz.newDayjs('2026-11-01T10:00').format('Z'), '-05:00');
  });

  it('shows a UTC date on the chosen wall clock', () => {
    const date = tz.fromUtc('2026-11-01T15:00:00');
    assert.equal(date.format('YYYY-MM-DD HH:mm'), '2026-11-01 10:00');
    assert.equal(date.valueOf(), Date.UTC(2026, 10, 1, 15));
    assert.equal(
      tz.fromUtc('2026-11-01T15:00:00.000Z').format('HH:mm'),
      '10:00',
    );
    assert.equal(tz.newDayjs('2026-11-01T15:00:00Z').format('HH:mm'), '10:00');
  });

  it('keeps the day on the chosen wall clock across the change', () => {
    const day = tz.newDayjs('2026-11-01');
    assert.equal(day.startOf('day').utc().format(UTC), '2026-11-01T04:00:00');
    assert.equal(day.endOf('day').utc().format(UTC), '2026-11-02T04:59:59');
    assert.equal(
      day.add(1, 'day').format('YYYY-MM-DD HH:mm'),
      '2026-11-02 00:00',
    );
    assert.equal(day.add(1, 'day').utc().format(UTC), '2026-11-02T05:00:00');
    assert.equal(day.hour(10).utc().format(UTC), '2026-11-01T15:00:00');
  });

  it('counts hours as elapsed time through the repeated hour', () => {
    const midnight = tz.newDayjs('2026-11-01');
    const first = midnight.add(1, 'hour');
    const second = midnight.add(2, 'hour');
    assert.equal(first.format('HH:mm Z'), '01:00 -04:00');
    assert.equal(second.format('HH:mm Z'), '01:00 -05:00');
    assert.equal(second.diff(first, 'minute'), 60);
    // a wall clock in the repeated hour is its first pass
    assert.equal(
      tz.newDayjs('2026-11-01 01:30').utc().format(UTC),
      '2026-11-01T05:30:00',
    );
  });

  it('puts posts of both passes of the repeated hour in its calendar row', () => {
    // the calendar matches a post to an hour cell on this wall clock key
    const cell = tz.newDayjs('2026-11-01').hour(1).startOf('hour');
    const key = 'YYYY-MM-DD HH';
    assert.equal(cell.format(key), '2026-11-01 01');
    assert.equal(
      tz.fromUtc('2026-11-01T05:30:00').format(key),
      cell.format(key),
    );
    assert.equal(
      tz.fromUtc('2026-11-01T06:30:00').format(key),
      cell.format(key),
    );
  });

  it('moves a skipped time forward, like a local date', () => {
    assert.equal(
      tz.newDayjs('2026-03-08 02:30').format('HH:mm Z'),
      '03:30 -04:00',
    );
  });

  it('compares days in the chosen timezone', () => {
    // 01:00 in Istanbul on Nov 2 is still Nov 1 in New York
    const late = tz.fromUtc('2026-11-01T22:00:00');
    assert.ok(late.isSame(tz.newDayjs('2026-11-01'), 'day'));
    assert.equal(late.format('YYYY-MM-DD'), '2026-11-01');
    assert.equal(
      dayjs.utc('2026-11-01T22:00:00').local().format('YYYY-MM-DD'),
      '2026-11-02',
    );
  });

  it('formats without a pattern with the offset', () => {
    assert.equal(
      tz.fromUtc('2026-11-01T15:00:00').format(),
      '2026-11-01T10:00:00-05:00',
    );
  });

  it('leaves plain dayjs alone', () => {
    assert.equal(
      dayjs('2026-11-01 10:00').utc().format(UTC),
      '2026-11-01T07:00:00',
    );
  });

  it('goes back to the browser timezone when cleared', () => {
    tz.setUserTimezone(null);
    assert.equal(tz.getTimezone(), 'Europe/Istanbul');
    assert.equal(
      tz.newDayjs('2026-11-01 10:00').utc().format(UTC),
      '2026-11-01T07:00:00',
    );
    assert.equal(tz.fromUtc('2026-11-01T15:00:00').format('HH:mm'), '18:00');
  });

  it('ignores a name that is not a timezone', () => {
    tz.setUserTimezone('Mars/Olympus');
    assert.equal(tz.getTimezone(), 'Europe/Istanbul');
  });
});
