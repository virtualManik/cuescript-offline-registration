export const REGISTRATION_URL =
  'https://www.cuescript.tv/catalog/software_registration_successful.php';

const INVALID_DATE = '0000-00-00';
const LIFETIME_TERM_DAYS = 365000;
const ADDON_METADATA_KEYS = new Set(['demoexpires']);

const firstDefined = (record, fields) => fields
  .map((field) => record[field])
  .find((value) => value !== undefined && value !== null && value !== '');

const isUsableDate = (value) => {
  if (!value || value === INVALID_DATE) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
};

const calculateExpiration = (record) => {
  const startDate = isUsableDate(record.licences_renewal_date)
    ? record.licences_renewal_date
    : record.licences_initial_activation_date;
  const termDays = Number.parseInt(record.licences_term_in_days, 10);
  if (!isUsableDate(startDate) || !Number.isFinite(termDays) || termDays >= LIFETIME_TERM_DAYS) {
    return null;
  }

  const expiration = new Date(`${startDate}T00:00:00Z`);
  expiration.setUTCDate(expiration.getUTCDate() + termDays);
  return expiration.toISOString().slice(0, 10);
};

const parsePhpArray = (body) => {
  const trimmed = body.trim();
  if (!trimmed || /^error\b/i.test(trimmed)) {
    throw new Error(trimmed || 'The registration server returned an empty response.');
  }

  const record = {};
  // Read each value up to the next "[field] =>" marker so both PHP's
  // line-broken print_r output and a whitespace-collapsed response work.
  // This also preserves empty fields such as "[currency] =>".
  const entryPattern = /\[([^\]]+)\][\t ]*=>[\t ]*([\s\S]*?)(?=\s*\[[^\]]+\][\t ]*=>|\s*\)\s*$)/g;
  for (const match of trimmed.matchAll(entryPattern)) {
    record[match[1]] = match[2].trim();
  }

  if (!record.licences_code) {
    throw new Error('The server response could not be read as registration data.');
  }
  return record;
};

const isEnabled = (value) => {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'demo', 'trial'].includes(value.trim().toLowerCase());
};

const parseAddons = (rawOptions) => {
  if (!rawOptions) return [];

  let options;
  try {
    options = JSON.parse(rawOptions);
  } catch {
    return [];
  }

  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    return [];
  }

  const demoExpiration = isUsableDate(options.demoexpires) ? options.demoexpires : null;
  return Object.entries(options)
    .filter(([name, value]) => {
      const normalizedName = name.toLowerCase();
      return !ADDON_METADATA_KEYS.has(normalizedName)
        && !normalizedName.endsWith('key')
        && !normalizedName.endsWith('-demo')
        && isEnabled(value);
    })
    .map(([name, value]) => {
      const demo = String(value).toLowerCase() === 'demo'
        || String(options[`${name}key`]).toLowerCase() === 'demo'
        || isEnabled(options[`${name}-demo`]);
      return {
        name,
        demo,
        expiration: demo ? demoExpiration : null,
      };
    });
};

export const buildRegistrationLookupUrl = (serial) => {
  const url = new URL(REGISTRATION_URL);
  url.searchParams.set('check', 'true');
  url.searchParams.set('serial', serial);
  return url;
};

export const parseRegistrationLookupResponse = (body) => {
  const record = parsePhpArray(body);
  const addonDetails = parseAddons(record.licences_addon_options);

  return {
    serial: record.licences_code,
    flavor: record.licences_name,
    customerEmail: firstDefined(record, [
      'customers_email_address',
      'customers_email',
      'customer_email',
      'email_address',
      'email',
    ]) ?? null,
    initialActivationDate: isUsableDate(record.licences_initial_activation_date)
      ? record.licences_initial_activation_date
      : null,
    renewalDate: isUsableDate(record.licences_renewal_date)
      ? record.licences_renewal_date
      : null,
    addons: addonDetails.map(({ name }) => name).join(', '),
    addonDetails,
    regEndDate: calculateExpiration(record),
    demo: false,
    licenseType: 'licensed',
  };
};

export const lookupRegistration = async (serial, fetchImpl = fetch) => {
  if (typeof serial !== 'string' || serial.length !== 10) {
    return { ok: false, error: 'Serial number must be exactly 10 characters.' };
  }

  let response;
  try {
    response = await fetchImpl(buildRegistrationLookupUrl(serial));
  } catch (err) {
    return { ok: false, error: `Could not reach the registration server: ${err.message}` };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Registration server returned ${response.status} ${response.statusText}.`,
    };
  }

  const body = await response.text();
  try {
    return { ok: true, info: parseRegistrationLookupResponse(body) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
