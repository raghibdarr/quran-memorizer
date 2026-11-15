'use client';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  // Disabled: a muted surface and muted text, so it reads as not yet, not as broken
  primary:
    'tactile-btn bg-teal text-on-teal hover:bg-teal-light disabled:bg-foreground/10 disabled:text-muted disabled:shadow-none disabled:hover:bg-foreground/10',
  secondary: 'tactile-btn bg-gold/10 text-gold-deep hover:bg-gold/20 disabled:bg-foreground/10 disabled:text-muted disabled:shadow-none',
  ghost: 'text-muted hover:text-foreground hover:bg-foreground/5 disabled:opacity-40',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button({
  variant = 'primary',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'rounded-xl px-6 py-3 font-semibold',
        'disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
