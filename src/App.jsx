import * as React from 'react';
import logo from '@/assets/icons/512x512.png';
import {
  Loader2,
  CircleAlert,
  CircleCheck,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Search,
  Cpu,
  Package,
  Puzzle,
  CalendarClock,
  Mail,
} from 'lucide-react';
import MdiIcon from '@mdi/react';
import { mdiContentCopy } from '@mdi/js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MAX_REGISTRATION_LOOKUPS,
  parseRegistrationSearch,
} from '@/lib/registration.mjs';
import { lookupRegistrationSearch } from '@/lib/registration-client.mjs';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_TRUE_VALUES = new Set(['1', 'true', 'yes', 'demo', 'trial', 'evaluation', 'eval']);
const DEMO_FALSE_VALUES = new Set([
  '0',
  'false',
  'no',
  'licensed',
  'license',
  'full',
  'paid',
  'production',
  'standard',
]);
const LICENSE_DEMO_FIELDS = ['demo', 'isDemo', 'trial', 'isTrial', 'demoMode', 'licenseType', 'type', 'status'];
const ADDON_NAME_FIELDS = ['name', 'addon', 'addOn', 'title', 'label', 'id', 'module', 'feature'];
const ADDON_EXPIRATION_FIELDS = [
  'expires',
  'expiration',
  'expiry',
  'expireDate',
  'expirationDate',
  'expiryDate',
  'endDate',
  'regEndDate',
  'expiresAt',
];
const ADDON_DEMO_FIELDS = ['demo', 'isDemo', 'trial', 'isTrial', 'demoMode', 'licenseType', 'type', 'status'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function splitAddonNames(addons) {
  if (typeof addons !== 'string') return [];
  return addons.split(',').map((addon) => addon.trim()).filter(Boolean);
}

function firstDefined(source, fields) {
  if (!isPlainObject(source)) return undefined;
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null && source[field] !== '') {
      return source[field];
    }
  }
  return undefined;
}

function detectDemoValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (DEMO_TRUE_VALUES.has(normalized)) return true;
  if (DEMO_FALSE_VALUES.has(normalized)) return false;
  if (/\b(demo|trial|evaluation|eval)\b/.test(normalized)) return true;
  return null;
}

function detectDemoFromFields(source, fields) {
  if (!isPlainObject(source)) return null;

  for (const field of fields) {
    const detected = detectDemoValue(source[field]);
    if (detected !== null) return detected;
  }
  return null;
}

function parseExpirationDate(value) {
  if (value === undefined || value === null || value === '') return null;

  // JavaScript treats a bare YYYY-MM-DD string as midnight UTC. Formatting that
  // in a time zone west of UTC displays the previous calendar day. Registration
  // dates are calendar dates, so keep them in the user's local calendar instead.
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (
        date.getFullYear() === Number(year)
        && date.getMonth() === Number(month) - 1
        && date.getDate() === Number(day)
      ) {
        return date;
      }
      return null;
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseExpirationDate(value);
  if (date === null) {
    if (value === undefined || value === null || value === '') return null;
    return { label: 'Invalid expiry date', invalid: true };
  }

  return {
    label: date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    invalid: false,
  };
}

function normalizeAddonEntry(entry, fallbackName) {
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name ? { name, demo: null, expiration: null } : null;
  }

  if (!isPlainObject(entry)) return null;

  const rawName = firstDefined(entry, ADDON_NAME_FIELDS) ?? fallbackName;
  const name = rawName === undefined || rawName === null ? '' : String(rawName).trim();
  if (!name) return null;

  return {
    name,
    demo: detectDemoFromFields(entry, ADDON_DEMO_FIELDS),
    expiration: firstDefined(entry, ADDON_EXPIRATION_FIELDS),
  };
}

function mergeAddon(addons, addon) {
  if (!addon) return;

  const key = addon.name.toLowerCase();
  const existing = addons.get(key);
  if (!existing) {
    addons.set(key, addon);
    return;
  }

  addons.set(key, {
    ...existing,
    ...addon,
    demo: addon.demo ?? existing.demo,
    expiration: addon.expiration ?? existing.expiration,
  });
}

function addAddonEntries(addons, entries) {
  if (Array.isArray(entries)) {
    entries.forEach((entry) => mergeAddon(addons, normalizeAddonEntry(entry)));
    return;
  }

  if (typeof entries === 'string') {
    splitAddonNames(entries).forEach((name) => mergeAddon(addons, normalizeAddonEntry(name)));
    return;
  }

  if (isPlainObject(entries)) {
    Object.entries(entries).forEach(([name, value]) => {
      if (isPlainObject(value)) {
        mergeAddon(addons, normalizeAddonEntry(value, name));
      } else {
        mergeAddon(addons, normalizeAddonEntry(name));
      }
    });
  }
}

function applyAddonMap(addons, map, property, detector) {
  if (!isPlainObject(map)) return;

  Object.entries(map).forEach(([name, value]) => {
    const addon = normalizeAddonEntry(name);
    if (!addon) return;

    addon[property] = detector ? detector(value) : value;
    mergeAddon(addons, addon);
  });
}

function parseAddons(info) {
  const addons = new Map();

  addAddonEntries(addons, info?.addons);
  addAddonEntries(addons, info?.addonDetails);
  applyAddonMap(addons, info?.addonExpirations, 'expiration');
  applyAddonMap(addons, info?.addonDemos, 'demo', detectDemoValue);

  return Array.from(addons.values()).map((addon) => ({
    ...addon,
    formattedExpiration: formatDate(addon.expiration),
  }));
}

function formatRegistrationExpiration(value) {
  const date = parseExpirationDate(value);
  if (date === null && (value === undefined || value === null || value === '')) {
    return { expired: false, label: 'No expiration' };
  }

  if (date === null) {
    return { expired: false, label: 'Invalid expiration date' };
  }

  const expirationEnd = new Date(date);
  expirationEnd.setHours(23, 59, 59, 999);

  return {
    expired: expirationEnd.getTime() < Date.now(),
    label: date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
}

function ResultRow({ icon: Icon, label, children, copyValue, copied, onCopy }) {
  const canCopy = typeof copyValue === 'string' && copyValue.length > 0;

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex shrink-0 items-center gap-2.5 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <div className="min-w-0 text-right text-sm font-medium">{children}</div>
        {canCopy && (
          <button
            type="button"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
            onClick={() => onCopy(copyValue)}
          >
            {copied ? <CircleCheck className="size-4 text-success" /> : <MdiIcon path={mdiContentCopy} size={0.75} />}
          </button>
        )}
      </div>
    </div>
  );
}

function LicenseResultCard({ result }) {
  const { info } = result;
  const formId = React.useId();
  const emailId = `${formId}-email`;
  const renewId = `${formId}-renew`;
  const [email, setEmail] = React.useState(info.customerEmail ?? '');
  const [renew, setRenew] = React.useState(false);
  const [generateLoading, setGenerateLoading] = React.useState(false);
  const [showGenerate, setShowGenerate] = React.useState(false);
  const [registration, setRegistration] = React.useState(null);
  const [savedPath, setSavedPath] = React.useState(null);
  const [saveError, setSaveError] = React.useState(null);
  const [generateError, setGenerateError] = React.useState(null);
  const [copiedKeys, setCopiedKeys] = React.useState(() => new Set());
  const copiedTimers = React.useRef(new Map());

  React.useEffect(() => () => {
    copiedTimers.current.forEach((timer) => clearTimeout(timer));
  }, []);

  const emailValid = EMAIL_PATTERN.test(email);
  const serialValid = typeof info.serial === 'string' && info.serial.length === 10;
  const canGenerate = serialValid && emailValid && !generateLoading;
  const expiration = formatRegistrationExpiration(info.regEndDate);
  const licenseDemo = detectDemoFromFields(info, LICENSE_DEMO_FIELDS) === true;
  const addons = parseAddons(info);
  const formatAddonsForClipboard = (items) => items.map((addon) => {
    const license = addon.demo === null ? null : (addon.demo ? 'Demo' : 'Licensed');
    const expiry = addon.formattedExpiration?.label ?? 'No expiry';
    return [addon.name, license, `Expires: ${expiry}`].filter(Boolean).join(' — ');
  }).join('; ');
  const addonCopyValue = formatAddonsForClipboard(addons);
  const initialActivation = formatDate(info.initialActivationDate)?.label;
  const renewalDate = formatDate(info.renewalDate)?.label;

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!canGenerate) return;
    setGenerateLoading(true);
    setGenerateError(null);
    setRegistration(null);
    setSavedPath(null);
    setSaveError(null);

    try {
      const response = await window.api.generateRegistration({
        serial: info.serial,
        email,
        renew,
      });
      if (response.ok) {
        setRegistration(response);
      } else {
        setGenerateError(response.error);
      }
    } catch (err) {
      setGenerateError(`Could not generate the registration: ${err.message}`);
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const response = await window.api.saveRegistration({
        serial: info.serial,
        raw: registration.raw,
      });
      if (response.canceled) return;
      if (response.error) {
        setSaveError(response.error);
      } else {
        setSavedPath(response.filePath);
      }
    } catch (err) {
      setSaveError(`Could not save the registration: ${err.message}`);
    }
  };

  const copyText = async (key, text) => {
    let response;
    try {
      response = await window.api.copyToClipboard(text);
    } catch {
      return;
    }
    if (!response.ok) return;

    const existingTimer = copiedTimers.current.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    setCopiedKeys((currentKeys) => new Set(currentKeys).add(key));
    const timer = setTimeout(() => {
      setCopiedKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys);
        nextKeys.delete(key);
        return nextKeys;
      });
      copiedTimers.current.delete(key);
    }, 2000);
    copiedTimers.current.set(key, timer);
  };

  const licenseSummary = [
    `License Status: ${licenseDemo ? 'Demo' : 'Licensed'}`,
    `Registration Status: ${expiration?.expired ? 'Expired' : 'Valid'}`,
    `Serial Number: ${info.serial}`,
    `Flavor: ${String(info.flavor ?? '—')}`,
    `Customer Email: ${info.customerEmail ?? '—'}`,
    `Initial Activation: ${initialActivation ?? '—'}`,
    `Renewal: ${renewalDate ?? 'No renewal'}`,
    `Addons: ${addonCopyValue || 'None'}`,
    `Expiration: ${expiration?.label ?? '—'}`,
  ].join('\n');

  return (
    <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Registration retrieved</CardTitle>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge variant={licenseDemo ? 'default' : 'success'}>
                    {licenseDemo ? 'Demo' : 'Licensed'}
                  </Badge>
                  <Badge variant={expiration?.expired ? 'destructive' : 'success'}>
                    {expiration?.expired ? 'Expired' : 'Valid'}
                  </Badge>
                </div>
              </div>
              <CardDescription>
                Review the registration details, then generate an offline registration only if needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y rounded-lg border px-4">
                <ResultRow
                  icon={Cpu}
                  label="Serial Number"
                  copyValue={info.serial}
                  copied={copiedKeys.has('serial')}
                  onCopy={(text) => copyText('serial', text)}
                >
                  <span className="font-mono">{info.serial}</span>
                </ResultRow>
                <ResultRow
                  icon={Package}
                  label="Flavor"
                  copyValue={info.flavor === undefined || info.flavor === null ? '' : String(info.flavor)}
                  copied={copiedKeys.has('flavor')}
                  onCopy={(text) => copyText('flavor', text)}
                >
                  {String(info.flavor ?? '—')}
                </ResultRow>
                <ResultRow
                  icon={Mail}
                  label="Customer Email"
                  copyValue={info.customerEmail ?? ''}
                  copied={copiedKeys.has('email')}
                  onCopy={(text) => copyText('email', text)}
                >
                  {info.customerEmail ?? <span className="text-muted-foreground">—</span>}
                </ResultRow>
                <ResultRow
                  icon={CalendarClock}
                  label="Initial Activation"
                  copyValue={initialActivation ?? ''}
                  copied={copiedKeys.has('initialActivation')}
                  onCopy={(text) => copyText('initialActivation', text)}
                >
                  {initialActivation ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </ResultRow>
                <ResultRow
                  icon={CalendarClock}
                  label="Renewal"
                  copyValue={renewalDate ?? ''}
                  copied={copiedKeys.has('renewal')}
                  onCopy={(text) => copyText('renewal', text)}
                >
                  {renewalDate ?? (
                    <span className="text-muted-foreground">No renewal</span>
                  )}
                </ResultRow>
                <ResultRow
                  icon={Puzzle}
                  label="Addons"
                  copyValue={addonCopyValue}
                  copied={copiedKeys.has('addons')}
                  onCopy={(text) => copyText('addons', text)}
                >
                  {addons.length > 0 ? (
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {addons.map((addon) => (
                        <span
                          key={addon.name}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                        >
                          <span className="truncate font-medium text-foreground">{addon.name}</span>
                          {addon.demo !== null && (
                            <Badge variant={addon.demo ? 'default' : 'success'} className="px-1.5 py-0">
                              {addon.demo ? 'Demo' : 'Lic'}
                            </Badge>
                          )}
                          <span
                            className={
                              addon.formattedExpiration?.invalid ? 'text-destructive' : undefined
                            }
                          >
                            {addon.formattedExpiration?.label
                              ? `Exp ${addon.formattedExpiration.label}`
                              : 'No expiry'}
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </ResultRow>
                <ResultRow
                  icon={CalendarClock}
                  label="Expiration"
                  copyValue={expiration?.label === 'No expiration' ? '' : expiration?.label ?? ''}
                  copied={copiedKeys.has('expiration')}
                  onCopy={(text) => copyText('expiration', text)}
                >
                  <span className={expiration?.expired ? 'text-destructive' : undefined}>
                    {expiration?.label}
                  </span>
                </ResultRow>
              </div>

              {showGenerate && !registration && (
                <form className="mt-4 space-y-4 rounded-lg border p-4" onSubmit={handleGenerate}>
                  <div className="space-y-2">
                    <Label htmlFor={emailId}>Customer Email</Label>
                    <Input
                      id={emailId}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.trim())}
                      placeholder="customer@example.com"
                      spellCheck={false}
                    />
                    {email.length > 0 && !emailValid && (
                      <p className="text-xs text-destructive">Enter a valid email address.</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Checkbox id={renewId} checked={renew} onCheckedChange={setRenew} />
                    <Label htmlFor={renewId} className="cursor-pointer" onClick={() => setRenew(!renew)}>
                      Renew existing registration
                    </Label>
                  </div>

                  {generateError && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" />
                      <span className="break-words">{generateError}</span>
                    </div>
                  )}

                  <Button type="submit" size="lg" className="w-full" disabled={!canGenerate}>
                    {generateLoading ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Generating registration…
                      </>
                    ) : (
                      <>
                        <Download />
                        Generate .csr
                      </>
                    )}
                  </Button>
                </form>
              )}

              {registration && (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-success-soft p-3 text-sm text-success">
                  <CircleCheck className="mt-0.5 size-4 shrink-0" />
                  <span>Offline registration is ready to save.</span>
                </div>
              )}

              {savedPath && (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-success-soft p-3 text-sm text-success">
                  <CircleCheck className="mt-0.5 size-4 shrink-0" />
                  <span className="break-all">Saved to {savedPath}</span>
                </div>
              )}
              {saveError && (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span className="break-words">{saveError}</span>
                </div>
              )}
            </CardContent>
            {((!showGenerate && !registration) || registration) && (
              <CardFooter className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2">
              {!showGenerate && !registration && (
                <>
                  <Button
                    size="lg"
                    className="w-full px-3"
                    onClick={() => {
                      setShowGenerate(true);
                      setGenerateError(null);
                      setSaveError(null);
                    }}
                  >
                    <Download />
                    Generate
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="w-full px-3"
                    aria-label="Copy license information"
                    onClick={() => copyText('licenseSummary', licenseSummary)}
                  >
                    {copiedKeys.has('licenseSummary') ? <CircleCheck className="text-success" /> : <MdiIcon path={mdiContentCopy} size={1} />}
                    Copy License Info
                  </Button>
                </>
              )}
              {registration && (
                <Button size="lg" className="w-full px-3 min-[600px]:col-span-2" onClick={handleSave}>
                  <Download />
                  {savedPath ? 'Save Again…' : 'Save .csr File…'}
                </Button>
              )}
              </CardFooter>
            )}
    </Card>
  );
}

function FailedLookupCard({ result }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>License lookup failed</CardTitle>
            <CardDescription className="mt-1 truncate font-mono">
              {result.serial}
            </CardDescription>
          </div>
          <Badge variant="destructive">Failed</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2.5 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{result.error}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function App() {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [lookupResults, setLookupResults] = React.useState(null);
  const [activeResultIndex, setActiveResultIndex] = React.useState(0);

  const parsedSearch = React.useMemo(
    () => parseRegistrationSearch(searchQuery),
    [searchQuery],
  );
  const hasInput = searchQuery.length > 0;
  const tooManyLicenses = parsedSearch.serials.length > MAX_REGISTRATION_LOOKUPS;
  const hasInvalidLicenses = parsedSearch.invalidSerials.length > 0;
  const allEntriesValid = parsedSearch.ok
    && parsedSearch.serials.length > 0
    && !hasInvalidLicenses;
  const canLookup = parsedSearch.ok && parsedSearch.validCount > 0 && !lookupLoading;

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!canLookup) return;

    setLookupLoading(true);
    setError(null);
    setLookupResults(null);

    try {
      const response = await lookupRegistrationSearch(window.api, searchQuery);
      if (response.ok) {
        setActiveResultIndex(0);
        setLookupResults(response.results);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(`Could not look up registrations: ${err.message}`);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleReset = () => {
    setActiveResultIndex(0);
    setLookupResults(null);
    setError(null);
  };

  const successfulLookups = lookupResults?.filter((result) => result.ok).length ?? 0;
  const totalLookups = lookupResults?.length ?? 0;
  const registrationLabel = totalLookups === 1 ? 'registration' : 'registrations';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="titlebar-drag flex items-center gap-3 px-6 pb-4 pt-10">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
          <img src={logo} alt="CueScript" className="size-6" />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">CueScript Offline Registration</h1>
          <p className="text-sm text-muted-foreground">
            Look up CueiT registration details and generate .csr files
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-6 pb-8">
        {lookupResults === null && (
          <Card>
            <form onSubmit={handleLookup}>
              <CardHeader>
                <CardTitle>License lookup</CardTitle>
                <CardDescription>
                  Enter one license number, or separate up to {MAX_REGISTRATION_LOOKUPS} with semicolons.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="license-search">License Number(s)</Label>
                    <span
                      className={
                        'text-xs tabular-nums '
                        + (allEntriesValid ? 'text-success' : 'text-muted-foreground')
                      }
                    >
                      {parsedSearch.serials.length}/{MAX_REGISTRATION_LOOKUPS}
                    </span>
                  </div>
                  <Input
                    id="license-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="0123456789; 9876543210"
                    autoFocus
                    spellCheck={false}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Each license number must be exactly 10 characters.
                  </p>
                  {hasInput && tooManyLicenses && (
                    <p className="text-xs text-destructive">{parsedSearch.error}</p>
                  )}
                  {hasInput && !tooManyLicenses && parsedSearch.serials.length === 0 && (
                    <p className="text-xs text-destructive">Enter at least one license number.</p>
                  )}
                  {!tooManyLicenses && hasInvalidLicenses && (
                    <p className="break-words text-xs text-destructive">
                      {parsedSearch.invalidSerials.length === 1
                        ? 'This entry is not 10 characters: '
                        : 'These entries are not 10 characters: '}
                      {parsedSearch.invalidSerials.join(', ')}
                    </p>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span className="break-words">{error}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button type="submit" size="lg" className="w-full" disabled={!canLookup}>
                  {lookupLoading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Looking up {parsedSearch.serials.length === 1 ? 'registration' : 'registrations'}…
                    </>
                  ) : (
                    <>
                      <Search />
                      Look Up {parsedSearch.serials.length === 1 ? 'Registration' : 'Registrations'}
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {lookupResults !== null && (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
              <div>
                <p className="font-medium">
                  {successfulLookups} of {totalLookups} {registrationLabel} retrieved
                </p>
                <p className="text-sm text-muted-foreground">
                  Showing result {activeResultIndex + 1} of {totalLookups} in the order entered.
                </p>
              </div>
              <Button size="lg" variant="outline" className="shrink-0" onClick={handleReset}>
                <RotateCcw />
                New Lookup
              </Button>
            </div>

            <div className="relative">
              {lookupResults.map((result, index) => (
                <div
                  key={`${index}-${result.serial}`}
                  className={index === activeResultIndex ? 'block' : 'hidden'}
                  aria-hidden={index !== activeResultIndex}
                >
                  {result.ok ? (
                    <LicenseResultCard result={result} />
                  ) : (
                    <FailedLookupCard result={result} />
                  )}
                </div>
              ))}

              {totalLookups > 1 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="absolute -left-5 top-1/2 z-10 size-10 -translate-y-1/2 rounded-full bg-background p-0 shadow-sm"
                    aria-label="Previous registration"
                    title="Previous registration"
                    disabled={activeResultIndex === 0}
                    onClick={() => setActiveResultIndex((index) => index - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="absolute -right-5 top-1/2 z-10 size-10 -translate-y-1/2 rounded-full bg-background p-0 shadow-sm"
                    aria-label="Next registration"
                    title="Next registration"
                    disabled={activeResultIndex === totalLookups - 1}
                    onClick={() => setActiveResultIndex((index) => index + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
