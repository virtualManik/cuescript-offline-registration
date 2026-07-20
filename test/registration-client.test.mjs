import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupRegistrationSearch } from '../src/lib/registration-client.mjs';

test('single-license searches use the original singular API', async () => {
  const calls = [];
  const api = {
    lookupRegistration: async (payload) => {
      calls.push(['singular', payload]);
      return { ok: true, info: { serial: payload.serial } };
    },
    lookupRegistrations: async () => {
      calls.push(['plural']);
      throw new Error('The plural API should not be used for one license.');
    },
  };

  const response = await lookupRegistrationSearch(api, '6396543855');

  assert.deepEqual(calls, [['singular', { serial: '6396543855' }]]);
  assert.deepEqual(response, {
    ok: true,
    results: [{ serial: '6396543855', ok: true, info: { serial: '6396543855' } }],
  });
});

test('multiple-license searches use the plural API when available', async () => {
  const api = {
    lookupRegistrations: async ({ query }) => ({
      ok: true,
      results: query.split(';').map((serial) => ({ serial, ok: true, info: { serial } })),
    }),
  };

  const response = await lookupRegistrationSearch(api, '6396543855;1234567890');

  assert.equal(response.ok, true);
  assert.deepEqual(response.results.map(({ serial }) => serial), ['6396543855', '1234567890']);
});

test('multiple-license searches fall back to the singular API and preserve failures', async () => {
  const calls = [];
  const api = {
    lookupRegistration: async ({ serial }) => {
      calls.push(serial);
      return { ok: true, info: { serial } };
    },
  };

  const response = await lookupRegistrationSearch(api, '6396543855;short;6396543855');

  assert.deepEqual(calls, ['6396543855', '6396543855']);
  assert.deepEqual(response.results.map(({ serial, ok }) => ({ serial, ok })), [
    { serial: '6396543855', ok: true },
    { serial: 'short', ok: false },
    { serial: '6396543855', ok: true },
  ]);
});

test('missing preload APIs return an actionable error', async () => {
  assert.deepEqual(await lookupRegistrationSearch(undefined, '6396543855'), {
    ok: false,
    error: 'The registration lookup service is unavailable. Restart the application and try again.',
  });
});
