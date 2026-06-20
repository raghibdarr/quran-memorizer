import { cn } from '@/lib/cn';

type CardVariant = 'quiet' | 'tactile';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
  /** Adds press physics — use when the card (or its wrapper link) is tappable. */
  pressable?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className, variant = 'quiet', pressable, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-card p-5',
        variant === 'quiet' && 'border border-foreground/10',
        variant === 'tactile' && 'tactile-card',
        (onClick || pressable) && 'cursor-pointer select-none pressable',
        'hover:bg-foreground/[0.02] dark:hover:brightness-110 transition-colors',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
