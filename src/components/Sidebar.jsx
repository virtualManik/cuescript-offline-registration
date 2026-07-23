import { KeyRound, Settings, UserSearch } from 'lucide-react';

const primaryItems = [
  { id: 'registration', label: 'Registration', icon: KeyRound },
  { id: 'customer', label: 'Customer Lookup', icon: UserSearch },
];

function SidebarButton({ item, page, onSelect }) {
  const Icon = item.icon;
  const selected = page === item.id;
  return (
    <button
      type="button"
      className={`group relative flex size-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
      aria-label={item.label}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onSelect(item.id)}
    >
      <Icon className="size-5" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {item.label}
      </span>
    </button>
  );
}

export function Sidebar({ page, logo, onSelect }) {
  const settingsItem = { id: 'settings', label: 'Settings', icon: Settings };
  return (
    <aside
      className="titlebar-drag fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center border-r bg-card px-3 pb-4 pt-9"
      aria-label="Application navigation"
    >
      <div className="mb-7 flex size-10 items-center justify-center rounded-xl bg-primary/10">
        <img src={logo} alt="CueScript" className="size-7 object-contain" />
      </div>
      <nav className="titlebar-no-drag flex flex-col gap-2" aria-label="Main">
        {primaryItems.map((item) => (
          <SidebarButton key={item.id} item={item} page={page} onSelect={onSelect} />
        ))}
      </nav>
      <div className="titlebar-no-drag mt-auto">
        <SidebarButton item={settingsItem} page={page} onSelect={onSelect} />
      </div>
    </aside>
  );
}
