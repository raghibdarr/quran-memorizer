import type { Metadata } from 'next';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import { GUIDES } from '@/content/guides';

export const metadata: Metadata = {
  title: 'Guides · Takrar',
  description: 'Short guides on memorising the Quran and keeping it: the 6-4-4-6 method, sabaq, sabqi and manzil, long ayahs, similar verses and reviews.',
};

/** Takrar's guides: how to memorise and keep the Quran, and how the app's method works */
export default function GuidesPage() {
  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <BackButton fallback="/essentials" />
          <span className="text-sm font-semibold text-teal">Guides</span>
          <span className="w-11" />
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-5 pb-[var(--tabbar-clearance)]">
        <h1 className="text-2xl font-bold text-foreground">Guides</h1>
        <p className="mt-1 text-sm text-muted">How to memorise the Quran and keep it, and how Takrar&apos;s method works. Short reads, a few minutes each.</p>
        <ul className="mt-5 space-y-3" data-guides>
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/blog/${g.slug}`} className="block rounded-2xl bg-card p-4">
                <span className="block text-base font-bold text-foreground">{g.title}</span>
                <span className="mt-1 block text-sm text-muted">{g.summary}</span>
                <span className="mt-2 block text-xs font-medium text-teal">{g.minutes} min read</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center text-sm text-muted">
          Ready to start? <Link href="/plans" className="font-semibold text-teal underline-offset-2 hover:underline">Pick a plan</Link>
        </p>
      </main>
    </div>
  );
}
