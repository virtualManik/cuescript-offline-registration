import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegistrationLookupUrl,
  lookupRegistration,
  lookupRegistrations,
  MAX_REGISTRATION_LOOKUPS,
  parseRegistrationSearch,
  parseRegistrationLookupResponse,
} from '../src/lib/registration.mjs';

const VALID_RESPONSE = `Array
(
    [licences_code] => 6396543855
    [licences_name] => news
    [customers_email_address] => customer@example.com
    [licences_purchase_date] => 0000-00-00
    [licences_initial_activation_date] => 2026-03-24
    [licences_renewal_date] => 0000-00-00
    [licences_term_in_days] => 9999996
    [currency] => 
    [licences_addon_options] => {"tci":"true","mac":"true","cueme3":"true","voice":"true","voicekey":"demo","voice-demo":"true","demoexpires":"2053-08-08"}
)`;

const SINGLE_LINE_RESPONSE = 'Array ( [licences_products_id] => 4574 [customers_id] => 12057 [licences_code] => 6396543855 [licences_name] => news [customers_email_address] => customer@example.com [licences_price] => 1250.00 [licences_purchase_date] => 0000-00-00 [licences_initial_activation_date] => 2026-03-24 [licences_renewal_date] => 0000-00-00 [licences_term_in_days] => 9999996 [currency] => [licences_addon_options] => {"tci":"true","mac":"true","cueme3":"true","voice":"true","voicekey":"demo","voice-demo":"true","demoexpires":"2053-08-08"} [licences_info_date_account_last_modified] => 0000-00-00 )';

const responseForSerial = (serial) => new Response(
  VALID_RESPONSE.replace('[licences_code] => 6396543855', `[licences_code] => ${serial}`),
);

test('builds the requested check URL', () => {
  assert.equal(
    buildRegistrationLookupUrl('6396543855').href,
    'https://www.cuescript.tv/catalog/software_registration_successful.php?check=true&serial=6396543855',
  );
});

test('parses the lookup response and add-on details', () => {
  assert.deepEqual(parseRegistrationLookupResponse(VALID_RESPONSE), {
    serial: '6396543855',
    flavor: 'news',
    customerEmail: 'customer@example.com',
    initialActivationDate: '2026-03-24',
    renewalDate: null,
    addons: 'tci, mac, cueme3, voice',
    addonDetails: [
      { name: 'tci', demo: false, expiration: null },
      { name: 'mac', demo: false, expiration: null },
      { name: 'cueme3', demo: false, expiration: null },
      { name: 'voice', demo: true, expiration: '2053-08-08' },
    ],
    regEndDate: null,
    demo: false,
    licenseType: 'licensed',
  });
});

test('calculates the registration expiration from renewal date and term days', () => {
  const response = VALID_RESPONSE
    .replace('[licences_renewal_date] => 0000-00-00', '[licences_renewal_date] => 2031-07-14')
    .replace('[licences_term_in_days] => 9999996', '[licences_term_in_days] => 30');

  const info = parseRegistrationLookupResponse(response);

  assert.equal(info.renewalDate, '2031-07-14');
  assert.equal(info.regEndDate, '2031-08-13');
});

test('calculates the registration expiration from activation date when there is no renewal', () => {
  const response = VALID_RESPONSE.replace(
    '[licences_term_in_days] => 9999996',
    '[licences_term_in_days] => 30',
  );

  assert.equal(parseRegistrationLookupResponse(response).regEndDate, '2026-04-23');
});

test('parses add-ons when the PHP array is returned on one line', () => {
  const info = parseRegistrationLookupResponse(SINGLE_LINE_RESPONSE);

  assert.equal(info.addons, 'tci, mac, cueme3, voice');
  assert.equal(info.customerEmail, 'customer@example.com');
  assert.equal(info.initialActivationDate, '2026-03-24');
  assert.equal(info.renewalDate, null);
  assert.deepEqual(info.addonDetails, [
    { name: 'tci', demo: false, expiration: null },
    { name: 'mac', demo: false, expiration: null },
    { name: 'cueme3', demo: false, expiration: null },
    { name: 'voice', demo: true, expiration: '2053-08-08' },
  ]);
});

test('treats null add-on options as no add-ons', () => {
  const response = VALID_RESPONSE.replace(
    /\[licences_addon_options\] => .+/,
    '[licences_addon_options] => null',
  );
  const info = parseRegistrationLookupResponse(response);

  assert.equal(info.serial, '6396543855');
  assert.equal(info.flavor, 'news');
  assert.equal(info.addons, '');
  assert.deepEqual(info.addonDetails, []);
});

test('lookup uses GET query parameters and reports endpoint errors', async () => {
  let requestedUrl;
  const success = await lookupRegistration('6396543855', async (url) => {
    requestedUrl = url.href;
    return new Response(VALID_RESPONSE);
  });

  assert.equal(
    requestedUrl,
    'https://www.cuescript.tv/catalog/software_registration_successful.php?check=true&serial=6396543855',
  );
  assert.equal(success.ok, true);

  const failure = await lookupRegistration('0000000000', async () => (
    new Response('Error getting customer email')
  ));
  assert.deepEqual(failure, { ok: false, error: 'Error getting customer email' });
});

test('parses single and semicolon-separated license searches', () => {
  assert.deepEqual(parseRegistrationSearch('6396543855'), {
    ok: true,
    error: null,
    serials: ['6396543855'],
    invalidSerials: [],
    validCount: 1,
  });

  assert.deepEqual(parseRegistrationSearch(' 6396543855 ; ; 1234567890; '), {
    ok: true,
    error: null,
    serials: ['6396543855', '1234567890'],
    invalidSerials: [],
    validCount: 2,
  });
});

test('preserves duplicate and invalid entries while parsing searches', () => {
  assert.deepEqual(parseRegistrationSearch('6396543855; short;6396543855'), {
    ok: true,
    error: null,
    serials: ['6396543855', 'short', '6396543855'],
    invalidSerials: ['short'],
    validCount: 2,
  });
});

test('batch lookup returns ordered partial results without fetching invalid entries', async () => {
  const requestedSerials = [];
  const result = await lookupRegistrations(
    '6396543855; short; 1234567890;6396543855',
    async (url) => {
      const serial = url.searchParams.get('serial');
      requestedSerials.push(serial);
      if (serial === '1234567890') {
        return new Response('Error getting customer email');
      }
      return responseForSerial(serial);
    },
  );

  assert.deepEqual(requestedSerials, ['6396543855', '1234567890', '6396543855']);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 4);
  assert.deepEqual(result.results.map(({ serial, ok }) => ({ serial, ok })), [
    { serial: '6396543855', ok: true },
    { serial: 'short', ok: false },
    { serial: '1234567890', ok: false },
    { serial: '6396543855', ok: true },
  ]);
  assert.equal(result.results[1].error, 'Serial number must be exactly 10 characters.');
  assert.equal(result.results[2].error, 'Error getting customer email');
});

test('batch lookup preserves input order when requests finish out of order', async () => {
  const serials = ['0000000001', '0000000002', '0000000003'];
  const delays = new Map([
    ['0000000001', 15],
    ['0000000002', 5],
    ['0000000003', 0],
  ]);
  const result = await lookupRegistrations(serials.join(';'), async (url) => {
    const serial = url.searchParams.get('serial');
    await new Promise((resolve) => setTimeout(resolve, delays.get(serial)));
    return responseForSerial(serial);
  });

  assert.deepEqual(result.results.map(({ serial }) => serial), serials);
  assert.deepEqual(result.results.map(({ info }) => info.serial), serials);
});

test('batch lookup runs no more than four requests concurrently', async () => {
  const serials = Array.from({ length: 10 }, (_, index) => String(index).padStart(10, '0'));
  let activeRequests = 0;
  let maximumActiveRequests = 0;

  const result = await lookupRegistrations(serials.join(';'), async (url) => {
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeRequests -= 1;
    return responseForSerial(url.searchParams.get('serial'));
  });

  assert.equal(result.ok, true);
  assert.equal(maximumActiveRequests, 4);
});

test('batch lookup rejects empty and oversized searches before fetching', async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return responseForSerial('0000000000');
  };

  assert.deepEqual(await lookupRegistrations(' ; ', fetchImpl), {
    ok: false,
    error: 'Enter at least one license number.',
  });

  const tooMany = Array.from(
    { length: MAX_REGISTRATION_LOOKUPS + 1 },
    (_, index) => String(index).padStart(10, '0'),
  ).join(';');
  assert.deepEqual(await lookupRegistrations(tooMany, fetchImpl), {
    ok: false,
    error: `Enter no more than ${MAX_REGISTRATION_LOOKUPS} license numbers at a time.`,
  });
  assert.equal(fetchCalls, 0);
});
