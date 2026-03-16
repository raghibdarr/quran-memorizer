'use client';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-teal text-white hover:bg-teal-light',
  secondary: 'border-2 border-gold text-gold hover:bg-gold hover:text-white',
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
        'rounded-xl px-6 py-3 font-semibold transition-colors duration-200',
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
