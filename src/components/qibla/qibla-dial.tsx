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
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
const CARDINALS: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];

/**
 * The compass dial. North-up (a plain diagram) when `heading` is null; with a
 * heading, the card turns so north points north and the fixed index at the top
 * is where the phone points. The Kaaba marker sits on the qibla bearing and
 * stays upright.
 */
export default function QiblaDial({ bearing, heading, aligned = false, className }: QiblaDialProps) {
  const live = heading !== null;
  const turn = live ? -heading : 0;
  const marker = polar(bearing, 117);
  const lineEnd = polar(bearing, 100);

  return (
    <svg
      viewBox="0 0 300 300"
      className={cn('block h-auto w-full select-none', className)}
      role="img"
      aria-label={
        live
          ? `Compass. The qibla is ${Math.round(bearing)} degrees from north${aligned ? ', and you are facing it' : ''}.`
          : `Diagram with north at the top. The qibla is ${Math.round(bearing)} degrees clockwise from north.`
      }
      data-qibla-dial={live ? 'live' : 'diagram'}
    >
      {/* Fixed index: where the phone points (live only) */}
      {live && (
        <path
          d="M150 1 L158 13 L142 13 Z"
          className={cn('transition-colors duration-200', aligned ? 'fill-gold' : 'fill-teal')}
        />
      )}

      <circle
        cx={C}
        cy={C}
        r={134}
        className={cn(
          'fill-card transition-[stroke] duration-200',
          aligned ? 'stroke-gold' : 'stroke-foreground/15',
        )}
        strokeWidth={aligned ? 3 : 1.5}
      />

      <g transform={`rotate(${turn} ${C} ${C})`} data-dial-card>
        {TICKS.map((d) => {
          const major = d % 30 === 0;
          const a = polar(d, 131);
          const b = polar(d, major ? 120 : 125);
          return (
            <line
              key={d}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={major ? 'stroke-foreground/45' : 'stroke-foreground/20'}
              strokeWidth={major ? 1.5 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {CARDINALS.map(([label, d]) => {
          const p = polar(d, 103);
          return (
            <text
              key={label}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${-turn} ${p.x} ${p.y})`}
              className={cn('text-[15px] font-semibold', label === 'N' ? 'fill-teal' : 'fill-muted')}
            >
              {label}
            </text>
          );
        })}

        {/* Phone direction guide, live only: a faint line to the index */}
        {live && (
          <line
            x1={C}
            y1={C}
            x2={polar(heading, 92).x}
            y2={polar(heading, 92).y}
            className="stroke-foreground/15"
            strokeWidth={1.5}
            strokeDasharray="3 5"
            strokeLinecap="round"
          />
        )}

        {/* The qibla */}
        <line x1={C} y1={C} x2={lineEnd.x} y2={lineEnd.y} className="stroke-gold" strokeWidth={3} strokeLinecap="round" />
        <g transform={`translate(${marker.x} ${marker.y}) rotate(${-turn})`} data-kaaba-marker>
          <circle r={15} className={cn('fill-card stroke-gold transition-[stroke-width] duration-200')} strokeWidth={aligned ? 3 : 2} />
          {/* The Kaaba: a dark cube with its gold band */}
          {/* A fixed near-black in both themes (the ink token turns pale in dark), outlined so it holds on the dark card */}
          <rect x={-7} y={-7} width={14} height={14} rx={1.5} fill="#1d1b18" className="stroke-gold/70" strokeWidth={0.8} />
          <rect x={-7} y={-3.5} width={14} height={2.2} className="fill-gold" />
        </g>
      </g>

      <circle cx={C} cy={C} r={4.5} className="fill-foreground" />
    </svg>
  );
}
