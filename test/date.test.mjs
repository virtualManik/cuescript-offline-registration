import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExpirationDayDifference,
  formatExpirationDayDifference,
  parseCalendarDate,
} from '../src/lib/date.mjs';

const REFERENCE_DATE = new Date(2026, 6, 23, 18, 30);

test('parses date-only registration values as local calendar dates', () => {
  const date = parseCalendarDate('2026-07-23');

  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 6);
  assert.equal(date.getDate(), 23);
  assert.equal(date.getHours(), 0);
});

test('calculates positive, zero, and negative expiration day differences', () => {
  assert.equal(calculateExpirationDayDifference('2026-08-04', REFERENCE_DATE), 12);
  assert.equal(calculateExpirationDayDifference('2026-07-23', REFERENCE_DATE), 0);
  assert.equal(calculateExpirationDayDifference('2026-07-20', REFERENCE_DATE), -3);
});

test('formats singular and plural signed day differences', () => {
  assert.equal(formatExpirationDayDifference(12), '12 days');
  assert.equal(formatExpirationDayDifference(1), '1 day');
  assert.equal(formatExpirationDayDifference(0), '0 days');
  assert.equal(formatExpirationDayDifference(-1), '-1 day');
  assert.equal(formatExpirationDayDifference(-3), '-3 days');
});

test('returns no day difference for missing or invalid dates', () => {
  assert.equal(calculateExpirationDayDifference(null, REFERENCE_DATE), null);
  assert.equal(calculateExpirationDayDifference('', REFERENCE_DATE), null);
  assert.equal(calculateExpirationDayDifference('not-a-date', REFERENCE_DATE), null);
  assert.equal(calculateExpirationDayDifference('2026-02-30', REFERENCE_DATE), null);
  assert.equal(formatExpirationDayDifference(null), null);
});

test('uses calendar boundaries across daylight-saving transitions', () => {
  const springReference = new Date(2026, 2, 7, 23, 30);
  const fallReference = new Date(2026, 9, 31, 23, 30);

  assert.equal(calculateExpirationDayDifference('2026-03-09', springReference), 2);
  assert.equal(calculateExpirationDayDifference('2026-11-02', fallReference), 2);
});
