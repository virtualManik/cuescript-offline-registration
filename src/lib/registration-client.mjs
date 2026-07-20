import {
  parseRegistrationSearch,
  REGISTRATION_LOOKUP_CONCURRENCY,
} from './registration.mjs';

const invalidSerialResult = (serial) => ({
  serial,
  ok: false,
  error: 'Serial number must be exactly 10 characters.',
});

const normalizeLookupResult = (serial, result) => {
  if (result && typeof result.ok === 'boolean') {
    return { serial, ...result };
  }

  return {
    serial,
    ok: false,
    error: 'The registration lookup returned no result.',
  };
};

const lookupWithSingularApi = async (api, serials) => {
  const results = new Array(serials.length);
  let nextIndex = 0;

  const lookupNext = async () => {
    while (nextIndex < serials.length) {
      const index = nextIndex;
      nextIndex += 1;
      const serial = serials[index];

      if (serial.length !== 10) {
        results[index] = invalidSerialResult(serial);
        continue;
      }

      try {
        const result = await api.lookupRegistration({ serial });
        results[index] = normalizeLookupResult(serial, result);
      } catch (err) {
        results[index] = {
          serial,
          ok: false,
          error: `Could not look up this registration: ${err.message}`,
        };
      }
    }
  };

  const workerCount = Math.min(REGISTRATION_LOOKUP_CONCURRENCY, serials.length);
  await Promise.all(Array.from({ length: workerCount }, () => lookupNext()));
  return { ok: true, results };
};

export const lookupRegistrationSearch = async (api, query) => {
  const parsed = parseRegistrationSearch(query);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  // Keep the established single-license bridge as the primary path so a
  // renderer refresh remains compatible with an already-running preload.
  if (parsed.serials.length === 1 && typeof api?.lookupRegistration === 'function') {
    return lookupWithSingularApi(api, parsed.serials);
  }

  if (typeof api?.lookupRegistrations === 'function') {
    const response = await api.lookupRegistrations({ query });
    if (response && typeof response.ok === 'boolean') return response;
    return { ok: false, error: 'The registration lookup returned no result.' };
  }

  // An older preload can still service a pasted batch through repeated calls
  // to the original singular IPC route.
  if (typeof api?.lookupRegistration === 'function') {
    return lookupWithSingularApi(api, parsed.serials);
  }

  return {
    ok: false,
    error: 'The registration lookup service is unavailable. Restart the application and try again.',
  };
};
