'use client';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'tactile-btn bg-teal text-on-teal hover:bg-teal-light',
  secondary: 'tactile-btn bg-gold/10 text-gold-deep hover:bg-gold/20',
  ghost: 'text-muted hover:text-foreground hover:bg-foreground/5',
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
        'disabled:opacity-40 disabled:cursor-not-allowed',
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
