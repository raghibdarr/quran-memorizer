import type { Metadata } from 'next';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import { GUIDES, findGuide } from '@/content/guides';
import { MiniMarkdown } from '@/lib/mini-markdown';

export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const guide = findGuide((await params).slug);
  return guide ? { title: `${guide.title} · Takrar`, description: guide.summary } : {};
}

/** One of Takrar's guides (src/content/guides.ts), rendered at build time */
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = findGuide((await params).slug);
  if (!guide) return null;
  const others = GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);
  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <BackButton fallback="/blog" />
          <Link href="/blog" className="text-sm font-semibold text-teal">Guides</Link>
          <span className="w-11" />
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-5 py-6 pb-[var(--tabbar-clearance)]">
        <article className="text-[17px] leading-relaxed text-foreground/85" data-guide={guide.slug}>
          <h1 className="text-3xl font-bold leading-tight text-foreground">{guide.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {new Date(guide.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · {guide.minutes} min read
          </p>
          <p className="mt-4 text-lg text-foreground">{guide.summary}</p>
          <MiniMarkdown source={guide.body} />
        </article>

        <div className="mt-10 rounded-2xl bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Put it into practice</p>
          <p className="mt-1 text-sm text-muted">Pick a ready-made plan and the planner schedules your lessons and reviews.</p>
          <Link href="/plans" className="tactile-btn mt-3 flex min-h-11 items-center justify-center rounded-xl bg-teal text-sm font-semibold text-on-teal">
            See the plans
          </Link>
        </div>

        <h2 className="mt-10 text-sm font-semibold text-muted">More guides</h2>
        <ul className="mt-2 space-y-2">
          {others.map((g) => (
            <li key={g.slug}>
              <Link href={`/blog/${g.slug}`} className="block rounded-xl bg-foreground/[0.04] px-4 py-3">
                <span className="block text-sm font-semibold text-foreground">{g.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{g.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
