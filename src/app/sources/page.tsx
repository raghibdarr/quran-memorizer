import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Metadata } from 'next';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import { MiniMarkdown } from '@/lib/mini-markdown';
import { deckInfo } from '@/content/deen/registry';
import { ASK_A_SCHOLAR, UNREVIEWED_STATUS } from '@/lib/deen/flags';
import { allReviewers } from '@/components/deen/registry-names';
import { deckIdForSelection, errataBody, notIncludedSection } from '@/components/deen/sources-data';
import worksFile from '../../../content/deen/works.json';

export const metadata: Metadata = { title: 'Sources and method · Takrar' };

const CONTENT = join(process.cwd(), 'content', 'deen');

/** Every deck's SELECTION.md (the test fixture excluded), read at build time */
function selections(): { deck: string; title: string; body: string }[] {
  const out: { deck: string; title: string; body: string }[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== '_fixture' && e.name !== 'glossary') walk(join(dir, e.name));
      } else if (e.name === 'SELECTION.md') {
        const file = join(dir, e.name);
        const body = notIncludedSection(readFileSync(file, 'utf8'));
        if (!body) continue;
        const deck = deckIdForSelection(relative(CONTENT, file), (id) => !!deckInfo(id));
        out.push({ deck, title: deckInfo(deck)?.title ?? deck, body });
      }
    }
  };
  walk(CONTENT);
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function readErrata(): string | null {
  try {
    return errataBody(readFileSync(join(CONTENT, 'ERRATA.md'), 'utf8'));
  } catch {
    return null;
  }
}

const SCHOOL_LABEL: Record<string, string> = { hanafi: 'Hanafi', maliki: 'Maliki', shafii: "Shafi'i", hanbali: 'Hanbali' };
const primers = (worksFile as { works: { title: string; kind?: string; school?: string }[] }).works.filter((w) => w.kind === 'primer' && w.school);

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-3">
      <h2 id={`${id}-title`} className="text-lg font-bold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * /sources (all-in-one spec 5.6): how deen texts are sourced and checked, the
 * scope, what "source-checked" does and does not mean, reviewers, what was left
 * out and why, corrections, and the licences. Built into the page at build
 * time, so it reads the same offline.
 */
export default function Page() {
  const reviewers = allReviewers();
  const left = selections();
  const errata = readErrata();

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/essentials" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Sources and method</h1>
          <span aria-hidden />
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-8 px-4 pt-5 text-sm leading-relaxed text-foreground">
        <p className="text-muted">
          Where each hadith, dua and lesson in Takrar comes from, how it was checked, and what has not been checked yet.
        </p>

        <Section id="method" title="How each text is checked">
          <ul className="list-disc space-y-2 pl-5 marker:text-gold">
            <li>
              <strong className="font-semibold">Quran.</strong> Ayahs are shown from the same Quran text as the rest of the app. They are
              never retyped.
            </li>
            <li>
              <strong className="font-semibold">Arabic of hadith and duas.</strong> Taken from a published copy, then compared letter by
              letter with at least one more, independent copy. At least one of them does not come from Sunnah.com. Where copies differ, the
              wording chosen and the reason are recorded.
            </li>
            <li>
              <strong className="font-semibold">English.</strong> Our own translation, made from the Arabic only. A separate check, which
              sees only the Arabic and our English, looks for anything missed, added or changed.
            </li>
            <li>
              <strong className="font-semibold">References.</strong> Every text names its collection and number, and which numbering that
              number follows. A number is written down only after it is found in two places.
            </li>
            <li>
              <strong className="font-semibold">Gradings.</strong> Each grading names the scholar who gave it and the book where it is
              found. Where scholars differ, each verdict is shown.
            </li>
            <li>
              <strong className="font-semibold">What is included.</strong> A narration is included only if it is in Sahih al-Bukhari or
              Sahih Muslim, or a named scholar graded it sahih or hasan and that verdict was found.
            </li>
          </ul>
        </Section>

        <Section id="source-checked" title="What “source-checked” means">
          <p>
            Every text in Takrar carries a status line. Today it reads: <em>{UNREVIEWED_STATUS}</em>
          </p>
          <p>
            Source-checked means the steps above were done and recorded for that text. They were done while the content was written, with
            the help of AI tools, and each step is logged. Nothing in the app is generated while you use it.
          </p>
          <p>It does not mean:</p>
          <ul className="list-disc space-y-1.5 pl-5 marker:text-gold">
            <li>that a scholar has reviewed the text, the translation or the notes;</li>
            <li>that our translation is the only right way to put it into English;</li>
            <li>a ruling for your own situation.</li>
          </ul>
          <p>When a scholar reviews a text, its status line will name them and the date.</p>
        </Section>

        <Section id="scope" title="Scope">
          <p>
            Takrar teaches within the four Sunni schools of law. Where they agree, a lesson says so and cites where that agreement is
            recorded. Where they differ, each school&apos;s position is shown from one standard primer, and Takrar does not pick between
            them:
          </p>
          <ul className="space-y-1.5" data-primers>
            {primers.map((p) => (
              <li key={p.school} className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold">{SCHOOL_LABEL[p.school!] ?? p.school}</span>
                <span className="text-muted">{p.title}</span>
              </li>
            ))}
          </ul>
          <p>If you choose your school, its position is listed first. The others stay in view.</p>
          <p className="font-medium">{ASK_A_SCHOLAR}</p>
        </Section>

        <Section id="reviewers" title="Reviewers">
          {reviewers.length === 0 ? (
            <p className="rounded-xl border border-foreground/10 bg-card px-4 py-3 text-muted" data-reviewers-empty>
              No scholar has reviewed this yet. We will name them here when one does.
            </p>
          ) : (
            <ul className="space-y-2">
              {reviewers.map((r) => (
                <li key={r.id} className="rounded-xl border border-foreground/10 bg-card px-4 py-3">
                  <p className="font-semibold">{r.name}</p>
                  {r.role && <p className="text-xs text-muted">{r.role}</p>}
                  {r.scope && <p className="mt-1 text-xs text-muted">{r.scope}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="not-included" title="Not included, and why">
          {left.length === 0 ? (
            <p className="text-muted">When a collection leaves a narration out, it is listed here with the reason.</p>
          ) : (
            left.map((s) => (
              <div key={s.deck} className="space-y-1" data-not-included={s.deck}>
                <h3 className="font-semibold">{s.title}</h3>
                <div className="text-muted [&>*:first-child]:mt-0">
                  <MiniMarkdown source={s.body} />
                </div>
              </div>
            ))
          )}
        </Section>

        <Section id="errata" title="Corrections">
          {errata ? (
            <div className="[&>*:first-child]:mt-0">
              <MiniMarkdown source={errata} />
            </div>
          ) : (
            <p className="text-muted">No corrections yet. When a text is corrected, the change is listed here with its date.</p>
          )}
        </Section>

        <Section id="licences" title="Licences">
          <p>
            Every source Takrar uses is openly licensed or our own work. The full notices are in{' '}
            <a href="/licenses.txt" target="_blank" rel="noopener" className="font-medium text-teal underline underline-offset-2">
              Notices and licences
            </a>
            .
          </p>
        </Section>
      </main>

      <BottomNav />
    </div>
  );
}
