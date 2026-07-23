import * as React from 'react';
import {
  Building2,
  CircleAlert,
  CircleCheck,
  Eye,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Search,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOCK_CUSTOMER = {
  firstName: 'Alex',
  lastName: 'Morgan',
  email: 'alex.morgan@example.com',
  company: 'Example Broadcast Studio',
  address: {
    street: '123 Studio Lane',
    suburb: 'Media District',
    postalCode: '10001',
    city: 'New York',
    state: 'NY',
    country: 'United States',
  },
  telephone: '+1 (555) 010-2040',
  fax: '+1 (555) 010-2041',
  account: {
    created: 'January 15, 2025',
    lastModified: 'July 18, 2026',
    lastLogon: 'July 22, 2026',
    logonCount: '14',
    reviewCount: '2',
  },
};

function Message({ error, children }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg p-3 text-sm ${
      error ? 'bg-destructive-soft text-destructive' : 'bg-success-soft text-success'
    }`}>
      {error ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <CircleCheck className="mt-0.5 size-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" /> {label}
      </span>
      <span className="min-w-0 break-words text-right text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

function CustomerCard({ customer, index, mock = false }) {
  const address = [
    customer.address?.street,
    customer.address?.suburb,
    customer.address?.city,
    customer.address?.state,
    customer.address?.postalCode,
    customer.address?.country,
  ].filter(Boolean).join(', ');
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{[customer.firstName, customer.lastName].filter(Boolean).join(' ') || `Customer ${index + 1}`}</CardTitle>
            <CardDescription>{mock ? 'Synthetic preview — no customer data was accessed' : 'Exact customer email match'}</CardDescription>
          </div>
          {mock && <Badge>Mock Data</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-lg border px-4">
          <Detail icon={Mail} label="Email" value={customer.email} />
          <Detail icon={Building2} label="Company" value={customer.company} />
          <Detail icon={MapPin} label="Address" value={address} />
          <Detail icon={Phone} label="Telephone" value={customer.telephone} />
          <Detail icon={Phone} label="Fax" value={customer.fax} />
          <Detail icon={UserRound} label="Account Created" value={customer.account?.created} />
          <Detail icon={UserRound} label="Last Modified" value={customer.account?.lastModified} />
          <Detail icon={UserRound} label="Last Login" value={customer.account?.lastLogon} />
          <Detail icon={UserRound} label="Login Count" value={customer.account?.logonCount} />
          <Detail icon={UserRound} label="Review Count" value={customer.account?.reviewCount} />
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomerLookupPage() {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [secureAvailable, setSecureAvailable] = React.useState(true);
  const [insecureTransport, setInsecureTransport] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [matches, setMatches] = React.useState(null);
  const [mockPreview, setMockPreview] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (typeof window.api?.adminStatus !== 'function') {
      setError('The administration service is unavailable. Restart the application and try again.');
      setChecking(false);
      return () => { active = false; };
    }
    window.api.adminStatus().then((response) => {
      if (!active) return;
      setAuthenticated(Boolean(response?.authenticated));
      setSecureAvailable(response?.secureAvailable !== false);
      setInsecureTransport(Boolean(response?.insecureTransport));
      if (!response?.ok) setError(response?.error || 'Secure administration access is unavailable.');
    }).catch(() => {
      if (active) setError('The administration service is unavailable.');
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, []);

  const login = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await window.api.adminLogin({ username: username.trim(), password });
      if (response.ok) {
        setAuthenticated(true);
        setUsername('');
      } else {
        setError(response.error);
      }
    } catch {
      setError('The administration service is unavailable.');
    } finally {
      setPassword('');
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await window.api.adminLogout();
    } finally {
      setAuthenticated(false);
      setEmail('');
      setMatches(null);
      setMockPreview(false);
      setError(null);
      setLoading(false);
    }
  };

  const validEmail = email.trim().length <= 254 && EMAIL_PATTERN.test(email.trim());
  const lookup = async (event) => {
    event.preventDefault();
    if (!validEmail || loading) return;
    setLoading(true);
    setError(null);
    setMatches(null);
    setMockPreview(false);
    try {
      const response = await window.api.lookupAdminCustomer({ email: email.trim() });
      if (response.ok) {
        setMatches(response.matches);
      } else {
        setError(response.error);
        if (response.code === 'SESSION_EXPIRED') setAuthenticated(false);
      }
    } catch {
      setError('The administration service is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return <main className="flex-1 px-6 pb-10"><Loader2 className="mx-auto mt-20 animate-spin text-primary" /></main>;
  }

  return (
    <main className="flex-1 space-y-4 px-6 pb-10">
      {!authenticated ? (
        <>
          <Card>
            <form onSubmit={login}>
              <CardHeader>
                <CardTitle>Administrator sign in</CardTitle>
                <CardDescription>Credentials are used for this login attempt only and are never saved.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-username">Username</Label>
                  <Input id="admin-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
                </div>
                {insecureTransport && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>Administrator credentials and customer data are sent over an insecure HTTP connection.</span>
                  </div>
                )}
                {error && <Message error>{error}</Message>}
              </CardContent>
              <CardFooter className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="w-full"
                  onClick={() => setMockPreview((current) => !current)}
                >
                  <Eye />
                  {mockPreview ? 'Hide Mock Data' : 'Preview Mock Data'}
                </Button>
                <Button type="submit" size="lg" className="w-full" disabled={!secureAvailable || loading || !username.trim() || !password}>
                  {loading ? <Loader2 className="animate-spin" /> : <UserRound />}
                  {loading ? 'Signing in…' : 'Sign In'}
                </Button>
              </CardFooter>
            </form>
          </Card>
          {mockPreview && <CustomerCard customer={MOCK_CUSTOMER} index={0} mock />}
        </>
      ) : (
        <>
          <Card>
            <form onSubmit={lookup}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Customer email lookup</CardTitle>
                    <CardDescription className="mt-1">Searches authenticated customer profiles for an exact email match.</CardDescription>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={logout} disabled={loading}>
                    <LogOut /> Sign Out
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Message>Administrator session active.</Message>
                <div className="space-y-2">
                  <Label htmlFor="customer-email-search">Customer Email</Label>
                  <Input
                    id="customer-email-search"
                    type="email"
                    value={email}
                    maxLength={254}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="customer@example.com"
                    spellCheck={false}
                  />
                  {email.length > 0 && !validEmail && <p className="text-xs text-destructive">Enter a valid customer email address.</p>}
                </div>
                {error && <Message error>{error}</Message>}
              </CardContent>
              <CardFooter>
                <Button type="submit" size="lg" className="w-full" disabled={loading || !validEmail}>
                  {loading ? <Loader2 className="animate-spin" /> : <Search />}
                  {loading ? 'Looking up customer…' : 'Look Up Customer'}
                </Button>
              </CardFooter>
            </form>
          </Card>
          {matches?.map((customer, index) => (
            <CustomerCard key={`${customer.email}-${index}`} customer={customer} index={index} />
          ))}
        </>
      )}
    </main>
  );
}
