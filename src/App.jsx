import * as React from 'react';
import logo from '@/assets/icons/512x512.png';
import {
  Loader2,
  CircleAlert,
  CircleCheck,
  Download,
  RotateCcw,
  Cpu,
  Package,
  Puzzle,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAddons(addons) {
  if (Array.isArray(addons)) return addons.map(String).filter(Boolean);
  if (typeof addons === 'string') {
    return addons.split(',').map((a) => a.trim()).filter(Boolean);
  }
  return [];
}

function ResultRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="text-sm font-medium text-right">{children}</div>
    </div>
  );
}

export default function App() {
  const [serial, setSerial] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [renew, setRenew] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [savedPath, setSavedPath] = React.useState(null);
  const [saveError, setSaveError] = React.useState(null);

  const serialValid = serial.length === 10;
  const emailValid = EMAIL_PATTERN.test(email);
  const canSubmit = serialValid && emailValid && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedPath(null);
    setSaveError(null);

    const response = await window.api.register({ serial, email, renew });
    setLoading(false);
    if (response.ok) {
      setResult(response);
    } else {
      setError(response.error);
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    const response = await window.api.saveRegistration({
      serial: result.info.serial,
      raw: result.raw,
    });
    if (response.canceled) return;
    if (response.error) {
      setSaveError(response.error);
    } else {
      setSavedPath(response.filePath);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setSavedPath(null);
    setSaveError(null);
    setRenew(false);
  };

  const expiration = result ? new Date(result.info.regEndDate) : null;
  const expired = expiration && expiration.getTime() < Date.now();
  const addons = result ? parseAddons(result.info.addons) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="titlebar-drag flex items-center gap-3 px-6 pb-4 pt-10">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
          <img src={logo} alt="CueScript" className="size-6" />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">CueScript Offline Registration</h1>
          <p className="text-sm text-muted-foreground">
            Generate a CueiT offline registration (.csr) file
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-6 pb-8">
        {!result && (
          <Card>
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle>Device details</CardTitle>
                <CardDescription>
                  Enter the device serial number and the customer's email address.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="serial">Serial Number</Label>
                    <span
                      className={
                        'text-xs tabular-nums ' +
                        (serialValid ? 'text-success' : 'text-muted-foreground')
                      }
                    >
                      {serial.length}/10
                    </span>
                  </div>
                  <Input
                    id="serial"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value.trim())}
                    maxLength={10}
                    placeholder="0123456789"
                    autoFocus
                    spellCheck={false}
                    className="font-mono tracking-widest"
                  />
                  {serial.length > 0 && !serialValid && (
                    <p className="text-xs text-destructive">
                      Serial number must be exactly 10 characters.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Customer Email</Label>
                  <Input
                    id="email"
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
                  <Checkbox id="renew" checked={renew} onCheckedChange={setRenew} />
                  <Label htmlFor="renew" className="cursor-pointer" onClick={() => setRenew(!renew)}>
                    Renew existing registration
                  </Label>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span className="break-words">{error}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Contacting registration server…
                    </>
                  ) : (
                    'Generate Registration'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {result && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Registration retrieved</CardTitle>
                <Badge variant={expired ? 'destructive' : 'success'}>
                  {expired ? 'Expired' : 'Valid'}
                </Badge>
              </div>
              <CardDescription>
                Save the .csr file and copy it to the offline device to complete registration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y rounded-lg border px-4">
                <ResultRow icon={Cpu} label="Serial Number">
                  <span className="font-mono">{result.info.serial}</span>
                </ResultRow>
                <ResultRow icon={Package} label="Flavor">
                  {String(result.info.flavor ?? '—')}
                </ResultRow>
                <ResultRow icon={Puzzle} label="Addons">
                  {addons.length > 0 ? (
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {addons.map((addon) => (
                        <Badge key={addon} variant="secondary">
                          {addon}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </ResultRow>
                <ResultRow icon={CalendarClock} label="Expiration">
                  <span className={expired ? 'text-destructive' : undefined}>
                    {expiration.toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </ResultRow>
              </div>

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
            <CardFooter className="gap-3">
              <Button size="lg" className="flex-1" onClick={handleSave}>
                <Download />
                {savedPath ? 'Save Again…' : 'Save .csr File…'}
              </Button>
              <Button size="lg" variant="outline" onClick={handleReset}>
                <RotateCcw />
                New Registration
              </Button>
            </CardFooter>
          </Card>
        )}
      </main>
    </div>
  );
}
