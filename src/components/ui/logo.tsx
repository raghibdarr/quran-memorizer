// The Takrar mark (logo "2d", 2026-09-28): ta (ت) as a wide bowl whose tip hooks
// into a repeat arrow — takrar is repetition. Same drawing as public/logos/takrar.svg
// and every generated icon (scripts/generate-brand-assets.mjs); keep them in step.

type LogoSize = 16 | 28 | 48 | 88

interface LogoProps {
  size?: LogoSize
  className?: string
}

export default function Logo({ size = 48, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Takrar" className={className}>
      <rect width="120" height="120" rx="28" fill="#1B4D5C" />
      <g transform="translate(0 2)">
        <path d="M24.55 55.83 A36 24 0 1 0 91.18 48" fill="none" stroke="#F3E7CF" strokeWidth="7" strokeLinecap="round" />
        <path d="M85.3 41.2 L96.7 44.5 L86.9 53.1 Z" fill="#F3E7CF" stroke="#F3E7CF" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="53" cy="37" r="5" fill="#C8963E" />
        <circle cx="67" cy="37" r="5" fill="#C8963E" />
      </g>
    </svg>
  )
}
