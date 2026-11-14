import Link from '@/components/app-link';
import { METHODS } from '@/lib/prayer/methods';
import PrayerScreen from './screen';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

const deg = (n: number) => `${n}°`;

/**
 * Why prayer times differ between apps, mosques and countries. Every position is
 * described, attributed where it belongs to a school or a body, and none is
 * called right. The method table is generated from src/lib/prayer/methods.ts,
 * so it always matches what the app calculates.
 */
export default function WhyTimesDiffer() {
  const methods = METHODS.filter((m) => m.id !== 'custom');
  return (
    <PrayerScreen title="Why times differ" back="/prayer/settings">
      <article className="space-y-6 pb-2">
        <p className="text-sm leading-relaxed text-foreground/85">
          Each prayer time is set by the sun: dawn, sunrise, the sun passing its highest point, the length of the afternoon shadow, sunset and nightfall.
          Turning those into clock times takes a few choices, and apps, mosques and countries make them differently. A difference of a few minutes
          usually means a different choice, not a mistake.
        </p>

        <Section title="Dhuhr and Maghrib">
          <p>
            These rarely differ. Dhuhr begins just after the sun passes its highest point, and Maghrib once it has set. Some timetables add a minute or
            two as a margin.
          </p>
        </Section>

        <Section title="Fajr and Isha: the angle of the sun">
          <p>
            Fajr begins with the first light of true dawn spreading along the horizon, and Isha once the evening twilight has gone. Both are reckoned
            from how far the sun is below the horizon. The bodies that publish timetables chose different angles, from their own observations and
            reasoning.
          </p>
          <p>
            A larger angle gives an earlier Fajr and a later Isha. One or two degrees can move a time by ten minutes or more, and further from the
            equator the gap grows.
          </p>
          <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card">
            <table className="w-full text-left text-xs" data-methods-table>
              <thead>
                <tr className="border-b border-foreground/10 text-muted">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Method
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">
                    Fajr
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Isha
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {methods.map((m) => (
                  <tr key={m.id}>
                    <th scope="row" className="px-3 py-2 font-semibold text-foreground">
                      {m.label}
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">{m.fajrAngle !== null ? deg(m.fajrAngle) : '–'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {m.ishaAngle !== null ? deg(m.ishaAngle) : m.ishaInterval ? `${m.ishaInterval} min after Maghrib` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            The Moonsighting Committee method also adjusts Fajr and Isha through the year, so its times are not set by the angle alone.
          </p>
        </Section>

        <Section title="Asr: one shadow length or two">
          <p>
            Asr is reckoned from the length of a shadow, over and above the shadow it had at noon. There are two well-known positions:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-semibold">When the shadow equals the object’s length.</span> The position of the Shafi&apos;i, Maliki and Hanbali
              schools. Takrar calls this “Standard”.
            </li>
            <li>
              <span className="font-semibold">When the shadow is twice the object’s length.</span> The position of the Hanafi school.
            </li>
          </ul>
          <p>The second comes later in the afternoon, often by half an hour or more. Takrar uses whichever you choose.</p>
        </Section>

        <Section title="Far north and far south">
          <p>
            In summer, far from the equator, the sun may not go far enough below the horizon for the usual Fajr and Isha angles, and close to the
            poles it may not set or rise at all. Scholars and timetables handle this in different ways: taking the middle of the night, a seventh of
            the night, a share of the night that follows the angle, or the times of the nearest day or place where they can be worked out.
          </p>
          <p>
            Takrar’s Automatic setting picks a rule suited to your latitude, and you can choose another in{' '}
            <Link href="/prayer/settings#high-latitude" className="font-semibold text-teal underline underline-offset-2">
              prayer settings
            </Link>
            . If a time can’t be worked out at all, Takrar shows none rather than a wrong one.
          </p>
        </Section>

        <Section title="Your mosque’s timetable">
          <p>
            Many mosques print their own timetable: a chosen method, a few minutes added as a margin, or times rounded to make them easier to follow.
            The time a prayer begins is also not the time of the congregation (the iqamah), which each mosque sets itself.
          </p>
          <p>
            To follow your mosque, use{' '}
            <Link href="/prayer/match" className="font-semibold text-teal underline underline-offset-2">
              Match my mosque
            </Link>{' '}
            with the start times from its timetable, or adjust each time by a few minutes in settings.
          </p>
        </Section>

        <div className="rounded-2xl border border-foreground/10 bg-card px-4 py-3.5 text-sm leading-relaxed text-muted">
          These are long-standing positions, and Takrar doesn’t choose between them. For your own situation, ask a scholar you trust.
        </div>
      </article>
    </PrayerScreen>
  );
}
