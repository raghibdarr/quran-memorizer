import { cn } from '@/lib/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-card p-5 shadow-sm transition-all',
        onClick && 'cursor-pointer',
        'hover:shadow-md hover:brightness-[0.98] dark:hover:brightness-110',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
