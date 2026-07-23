import { load } from 'cheerio';

export const ADMIN_ORIGIN = 'http://www.cuescript.tv';
export const ADMIN_PATH_PREFIX = '/catalog/admin/';
export const ADMIN_LOGIN_URL = `${ADMIN_ORIGIN}${ADMIN_PATH_PREFIX}login.php`;
export const ADMIN_CUSTOMERS_URL = `${ADMIN_ORIGIN}${ADMIN_PATH_PREFIX}customers.php`;
export const MAX_CUSTOMER_CANDIDATES = 10;

export const ADMIN_ERROR = Object.freeze({
  SECURE_TRANSPORT_REQUIRED: 'SECURE_TRANSPORT_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  NOT_FOUND: 'NOT_FOUND',
  TOO_MANY_MATCHES: 'TOO_MANY_MATCHES',
  REMOTE_FORMAT_CHANGED: 'REMOTE_FORMAT_CHANGED',
  NETWORK_ERROR: 'NETWORK_ERROR',
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email) => (
  typeof email === 'string' ? email.trim().toLowerCase() : ''
);

export const validateCustomerEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    return { ok: false, error: 'Enter a valid customer email address.' };
  }
  return { ok: true, email: normalized };
};

export const assertAllowedAdminUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED);
  }
  if (
    url.protocol !== 'http:'
    || url.origin !== ADMIN_ORIGIN
    || !url.pathname.startsWith(ADMIN_PATH_PREFIX)
  ) {
    throw new Error(ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED);
  }
  return url;
};

export const normalizeAdminRedirect = (location, baseUrl) => {
  let url;
  try {
    url = new URL(location, baseUrl);
  } catch {
    throw new Error(ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED);
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.hostname !== 'www.cuescript.tv'
    || (url.port && url.port !== '80')
    || url.username
    || url.password
    || !url.pathname.startsWith(ADMIN_PATH_PREFIX)
  ) {
    throw new Error(ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED);
  }
  url.protocol = 'http:';
  url.port = '';
  return assertAllowedAdminUrl(url);
};

export const buildCustomerSearchUrl = (email) => {
  const url = new URL(ADMIN_CUSTOMERS_URL);
  url.searchParams.set('search', email);
  return url;
};

export const isLoginPage = (html) => {
  const $ = load(html);
  return $('input[name="username"]').length > 0 && $('input[name="password"]').length > 0;
};

export const isAuthenticatedPage = (html) => {
  const $ = load(html);
  return !isLoginPage(html) && $('a').toArray().some((element) => (
    $(element).text().trim().toLowerCase() === 'logoff'
  ));
};

const customerIdFromHref = (href) => {
  try {
    return new URL(href, ADMIN_CUSTOMERS_URL).searchParams.get('cID');
  } catch {
    return null;
  }
};

export const extractCustomerCandidates = (html) => {
  const $ = load(html);
  const candidates = [];
  const seen = new Set();
  $('a[href*="customers.php"]').each((_index, element) => {
    const customerId = customerIdFromHref($(element).attr('href'));
    if (customerId && /^\d+$/.test(customerId) && !seen.has(customerId)) {
      seen.add(customerId);
      candidates.push(customerId);
    }
  });
  return candidates;
};

const inputValue = ($, name) => {
  const value = $(`[name="${name}"]`).first().attr('value');
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const selectedText = ($, name) => {
  const element = $(`select[name="${name}"] option:selected`).first();
  const text = element.text().trim();
  return text || null;
};

export const parseCustomerProfile = (html) => {
  const $ = load(html);
  const email = inputValue($, 'customers_email_address');
  if (!email) throw new Error(ADMIN_ERROR.REMOTE_FORMAT_CHANGED);

  return {
    firstName: inputValue($, 'customers_firstname'),
    lastName: inputValue($, 'customers_lastname'),
    email,
    company: inputValue($, 'entry_company'),
    address: {
      street: inputValue($, 'entry_street_address'),
      suburb: inputValue($, 'entry_suburb'),
      postalCode: inputValue($, 'entry_postcode'),
      city: inputValue($, 'entry_city'),
      state: inputValue($, 'entry_state'),
      country: selectedText($, 'entry_country_id'),
    },
    telephone: inputValue($, 'customers_telephone'),
    fax: inputValue($, 'customers_fax'),
  };
};

const summaryValue = ($, label) => {
  let match = null;
  $('td').each((_index, element) => {
    if (match !== null) return;
    const text = $(element).clone().children().remove().end().text().replace(/\s+/g, ' ').trim();
    const expression = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.*)`, 'i');
    const result = text.match(expression);
    if (result) match = result[1].trim() || null;
  });
  return match;
};

export const parseCustomerAccount = (html) => {
  const $ = load(html);
  return {
    created: summaryValue($, 'Account Created'),
    lastModified: summaryValue($, 'Last Modified'),
    lastLogon: summaryValue($, 'Last Logon'),
    logonCount: summaryValue($, 'Number of Logons'),
    reviewCount: summaryValue($, 'Number of Reviews'),
  };
};

export const matchesCustomerEmail = (profile, requestedEmail) => (
  normalizeEmail(profile?.email) === normalizeEmail(requestedEmail)
);
