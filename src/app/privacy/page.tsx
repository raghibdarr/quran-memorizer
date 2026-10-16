import type { Metadata } from 'next';
import BackButton from '@/components/ui/back-button';

export const metadata: Metadata = { title: 'Privacy · Takrar' };

// Set at build time; the stores require a working contact address
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const UPDATED = '16 October 2026';

/**
 * The privacy policy both app stores ask for. Written from what the code does:
 * local-first storage, optional Supabase sync, on-device voice check, audio
 * streamed from the reciters' hosts, no ads or analytics.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center">
          <BackButton fallback="/" />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-[var(--tabbar-clearance)] text-sm leading-relaxed text-foreground">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-teal">Privacy</h1>
          <p className="text-muted">Last updated {UPDATED}</p>
        </header>

        <p>
          Takrar is a free app for memorising and revising the Quran. It has no ads, no analytics and no tracking,
          and it never sells or shares your data. This page explains what it stores and where.
        </p>

        <Section title="Without an account">
          <p>
            Everything stays on your device: your lessons, reviews, streak, plan and settings. Takrar has no server copy
            of it. Settings can export it as a backup file, and can erase it from the device.
          </p>
        </Section>

        <Section title="With an account (optional)">
          <p>
            Signing in lets your progress sync between devices. Takrar then stores your email address and a copy of
            your progress with Supabase, its database provider. Signing in with Google shares your name and email
            address with Takrar through Google.
          </p>
          <p>
            You can delete your account at any time from the account menu. That deletes the account and everything
            synced to it straight away.
          </p>
        </Section>

        <Section title="Reminders and email">
          <p>
            In the phone apps, daily reminders are scheduled on your phone and nothing is sent to a server. On the web,
            reminders are optional push notifications: turning them on saves your browser&apos;s push address, your time
            zone and the hour you chose, so Takrar&apos;s server can send one reminder on days you have reviews due. The
            delivery goes through your browser maker&apos;s push service (for example Google, Apple or Mozilla).
          </p>
          <p>
            The weekly email is off unless you turn it on. When it&apos;s on, Takrar emails your account address through
            Resend if you&apos;ve been away for over a week with reviews due. Every email has a one-click unsubscribe link.
          </p>
        </Section>

        <Section title="Voice check">
          <p>
            The voice check listens through your microphone only while you&apos;ve started it. The speech recognition runs
            entirely on your phone; no audio or transcript leaves the device, and nothing is recorded or kept.
          </p>
        </Section>

        <Section title="Recitations and hosting">
          <p>
            Recitations stream from the services that host them: EveryAyah, QuranicAudio, MP3Quran, Tarteel and the
            Quran.com audio CDN. Like any website, those services see your device&apos;s IP address when it fetches a file.
            The Takrar website is hosted by Netlify, which keeps standard server logs.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Takrar can be used without an account, which stores nothing off the device. Accounts are meant for people
            aged 13 or over, or younger children with a parent&apos;s permission.
          </p>
        </Section>

        <Section title="Contact">
          {CONTACT ? (
            <p>
              Questions or requests about your data: <a className="text-teal underline underline-offset-2" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </p>
          ) : (
            <p>Questions about your data can be sent to the email address on Takrar&apos;s app store page.</p>
          )}
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
