import { cn } from '@/lib/cn';

interface QiblaDialProps {
  /** Qibla bearing, degrees clockwise from true north */
  bearing: number;
  /** The phone's heading when the compass is live; null draws the dial north-up */
  heading: number | null;
  aligned?: boolean;
  className?: string;
}

const C = 150;
const RIM = 134;
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

/** A wedge from the centre, `width` degrees wide around `deg` */
function sector(deg: number, width: number, r: number) {
  const a = polar(deg - width / 2, r);
  const b = polar(deg + width / 2, r);
  return `M${C} ${C} L${a.x} ${a.y} A${r} ${r} 0 0 1 ${b.x} ${b.y} Z`;
}

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
const CARDINALS: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];

/**
 * The compass dial. North-up (a plain diagram) when `heading` is null; with a
 * heading, the card turns so north points north and the fixed index at the top
 * is where the phone points. The Kaaba sits as a bead on the rim at the qibla
 * bearing and stays upright. Letters, ticks and bead live on separate rings, so
 * a bearing near N, E, S or W never covers a letter.
 */
export default function QiblaDial({ bearing, heading, aligned = false, className }: QiblaDialProps) {
  const live = heading !== null;
  const turn = live ? -heading : 0;
  const marker = polar(bearing, RIM);
  const lineEnd = polar(bearing, 119);
  const degrees = Math.round(bearing) % 360;

  return (
    <svg
      viewBox="-16 -16 332 332"
      className={cn('block h-auto w-full select-none', className)}
      role="img"
      aria-label={
        live
          ? `Compass. The qibla is ${degrees} degrees from north${aligned ? ', and you are facing it' : ''}.`
          : `Diagram with north at the top. The qibla is ${degrees} degrees clockwise from north.`
      }
      data-qibla-dial={live ? 'live' : 'diagram'}
    >
      {/* Fixed index: where the phone points (live only) */}
      {live && (
        <path
          d="M150 -14 L157 -3 L143 -3 Z"
          className={cn('transition-colors duration-200', aligned ? 'fill-gold' : 'fill-teal')}
        />
      )}

      <circle
        cx={C}
        cy={C}
        r={RIM}
        className={cn(
          'fill-card transition-[stroke] duration-200',
          aligned ? 'stroke-gold' : 'stroke-foreground/15',
        )}
        strokeWidth={aligned ? 3 : 2}
      />

      <g transform={`rotate(${turn} ${C} ${C})`} data-dial-card>
        {/* A soft wedge toward the qibla, so the diagram has a direction at a glance */}
        <path d={sector(bearing, 24, 112)} className="fill-gold/10" />
        <circle cx={C} cy={C} r={112} className="fill-none stroke-foreground/[0.06]" strokeWidth={1} />

        {TICKS.map((d) => {
          const north = d === 0;
          const major = d % 30 === 0;
          const a = polar(d, 131);
          const b = polar(d, north ? 116 : major ? 120 : 125);
          return (
            <line
              key={d}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={north ? 'stroke-teal' : major ? 'stroke-foreground/45' : 'stroke-foreground/20'}
              strokeWidth={north ? 2 : major ? 1.5 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Phone direction guide, live only: a faint line to the index */}
        {live && (
          <line
            x1={C}
            y1={C}
            x2={polar(heading, 110).x}
            y2={polar(heading, 110).y}
            className="stroke-foreground/15"
            strokeWidth={1.5}
            strokeDasharray="3 5"
            strokeLinecap="round"
          />
        )}

        {/* The qibla line runs under the letters; each letter carries a card-coloured halo */}
        <line x1={C} y1={C} x2={lineEnd.x} y2={lineEnd.y} className="stroke-gold" strokeWidth={3} strokeLinecap="round" />

        {CARDINALS.map(([label, d]) => {
          const p = polar(d, 92);
          return (
            <text
              key={label}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${-turn} ${p.x} ${p.y})`}
              paintOrder="stroke"
              strokeWidth={4.5}
              strokeLinejoin="round"
              className={cn('stroke-card text-[15px] font-semibold', label === 'N' ? 'fill-teal' : 'fill-muted')}
            >
              {label}
            </text>
          );
        })}

        <g transform={`translate(${marker.x} ${marker.y}) rotate(${-turn})`} data-kaaba-marker>
          {/* Card-coloured in light, solid gold in dark, so the dark cube always reads */}
          <circle
            r={13}
            className="fill-card stroke-gold transition-[stroke-width] duration-200 [.dark_&]:fill-gold"
            strokeWidth={aligned ? 3 : 2}
          />
          {/* The Kaaba: a dark cube with its gold band */}
          <rect x={-6} y={-6} width={12} height={12} rx={1.2} className="fill-kaaba" />
          <rect x={-6} y={-3} width={12} height={2} className="fill-gold [.dark_&]:fill-gold-light" />
        </g>
      </g>

      <circle cx={C} cy={C} r={5} className="fill-card stroke-foreground" strokeWidth={2} />
    </svg>
  );
}
