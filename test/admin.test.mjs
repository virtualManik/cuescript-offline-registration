import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_ERROR,
  MAX_CUSTOMER_CANDIDATES,
  assertAllowedAdminUrl,
  buildCustomerSearchUrl,
  extractCustomerCandidates,
  isAuthenticatedPage,
  isLoginPage,
  matchesCustomerEmail,
  normalizeAdminRedirect,
  parseCustomerAccount,
  parseCustomerProfile,
  validateCustomerEmail,
} from '../src/lib/admin.mjs';

const LOGIN_HTML = `
  <form><input name="username"><input name="password" type="password"></form>
`;

const PROFILE_HTML = `
  <form>
    <input name="customers_firstname" value="Alex &amp; Jo">
    <input name="customers_lastname" value="Example">
    <input name="customers_email_address" value="Customer@Example.com">
    <input name="entry_company" value="Example Studio">
    <input name="entry_street_address" value="1 Main Street">
    <input name="entry_suburb" value="">
    <input name="entry_postcode" value="10001">
    <input name="entry_city" value="New York">
    <input name="entry_state" value="NY">
    <select name="entry_country_id"><option selected>United States</option></select>
    <input name="customers_telephone" value="+1 555 0100">
    <input name="customers_fax" value="">
    <input name="customers_dob" value="2000-01-01">
  </form>
`;

const SUMMARY_HTML = `
  <table>
    <tr><td>Account Created: 07/23/2026</td></tr>
    <tr><td>Last Modified: 07/24/2026</td></tr>
    <tr><td>Last Logon: 07/25/2026</td></tr>
    <tr><td>Number of Logons: 4</td></tr>
    <tr><td>Number of Reviews: 2</td></tr>
  </table>
`;

test('validates and normalizes customer emails', () => {
  assert.deepEqual(validateCustomerEmail(' Customer@Example.COM '), {
    ok: true,
    email: 'customer@example.com',
  });
  assert.equal(validateCustomerEmail('not-an-email').ok, false);
  assert.equal(validateCustomerEmail(`${'a'.repeat(250)}@x.com`).ok, false);
});

test('builds an encoded customer search URL on the configured administration origin', () => {
  assert.equal(
    buildCustomerSearchUrl('customer+test@example.com').href,
    'http://www.cuescript.tv/catalog/admin/customers.php?search=customer%2Btest%40example.com',
  );
  assert.equal(
    assertAllowedAdminUrl('http://www.cuescript.tv/catalog/admin/customers.php').protocol,
    'http:',
  );
  assert.throws(
    () => assertAllowedAdminUrl('https://www.cuescript.tv/catalog/admin/customers.php'),
    { message: ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED },
  );
  assert.throws(
    () => assertAllowedAdminUrl('https://example.com/catalog/admin/customers.php'),
    { message: ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED },
  );
  assert.equal(
    normalizeAdminRedirect(
      'http://www.cuescript.tv/catalog/admin/login.php?osCAdminID=test',
      'http://www.cuescript.tv/catalog/admin/login.php',
    ).href,
    'http://www.cuescript.tv/catalog/admin/login.php?osCAdminID=test',
  );
  assert.throws(
    () => normalizeAdminRedirect(
      'http://example.com/catalog/admin/login.php',
      'http://www.cuescript.tv/catalog/admin/login.php',
    ),
    { message: ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED },
  );
});

test('detects login and authenticated administration pages', () => {
  assert.equal(isLoginPage(LOGIN_HTML), true);
  assert.equal(isAuthenticatedPage(LOGIN_HTML), false);
  assert.equal(isAuthenticatedPage('<a href="login.php?action=logoff">Logoff</a>'), true);
});

test('extracts unique customer candidates without exposing actions', () => {
  const html = `
    <a href="customers.php?page=1&cID=42"></a>
    <a href="customers.php?page=1&cID=42&action=edit">Edit</a>
    <a href="customers.php?page=1&cID=77&action=confirm">Delete</a>
  `;
  assert.deepEqual(extractCustomerCandidates(html), ['42', '77']);
  assert.equal(MAX_CUSTOMER_CANDIDATES, 10);
});

test('parses the allowed customer profile fields and omits sensitive fields', () => {
  const profile = parseCustomerProfile(PROFILE_HTML);
  assert.deepEqual(profile, {
    firstName: 'Alex & Jo',
    lastName: 'Example',
    email: 'Customer@Example.com',
    company: 'Example Studio',
    address: {
      street: '1 Main Street',
      suburb: null,
      postalCode: '10001',
      city: 'New York',
      state: 'NY',
      country: 'United States',
    },
    telephone: '+1 555 0100',
    fax: null,
  });
  assert.equal('dateOfBirth' in profile, false);
});

test('parses account metadata and exact case-insensitive email matches', () => {
  assert.deepEqual(parseCustomerAccount(SUMMARY_HTML), {
    created: '07/23/2026',
    lastModified: '07/24/2026',
    lastLogon: '07/25/2026',
    logonCount: '4',
    reviewCount: '2',
  });
  const profile = parseCustomerProfile(PROFILE_HTML);
  assert.equal(matchesCustomerEmail(profile, ' customer@example.COM '), true);
  assert.equal(matchesCustomerEmail(profile, 'other@example.com'), false);
  assert.equal(matchesCustomerEmail(profile, 'customer@'), false);
});

test('rejects malformed profile markup', () => {
  assert.throws(
    () => parseCustomerProfile('<input name="customers_firstname" value="No Email">'),
    { message: ADMIN_ERROR.REMOTE_FORMAT_CHANGED },
  );
});
