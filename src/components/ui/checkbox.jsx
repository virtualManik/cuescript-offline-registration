import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const Checkbox = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    ref={ref}
    onClick={() => onCheckedChange?.(!checked)}
    className={cn(
      'peer size-5 shrink-0 rounded-md border border-input shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      checked && 'border-primary bg-primary text-primary-foreground',
      className,
    )}
    {...props}
  >
    {checked && <Check className="size-4 stroke-[3]" />}
  </button>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
