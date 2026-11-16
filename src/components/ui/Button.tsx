import React from 'react';
import type { LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-600/60',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-muted shadow-sm disabled:text-ink-subtle',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger: 'bg-rose-700 text-white hover:bg-rose-800 shadow-sm disabled:bg-rose-700/60',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-control font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
};

/** A labelled button. Icon-only buttons are not offered on purpose: every action shows its name. */
export function Button({ variant = 'primary', size = 'md', icon: Icon, className = '', children, ...rest }: Props) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </button>
  );
}
