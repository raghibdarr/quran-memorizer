// Weekly email digest (M8), opt-in from Settings. For a user who's been away a week
// or more with reviews piling up: one short email with what's due, a link back in,
// and a one-click unsubscribe. At most once a week per user.
//
// Netlify env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//              RESEND_API_KEY, DIGEST_FROM ("Takrar <hello@your-domain>"), DIGEST_SECRET
//              URL (set by Netlify: the site's address)
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { daysAway, dueToday, wantsDigest } from '../../src/lib/notify-summary';

export const config = { schedule: '0 9 * * 1' }; // Mondays, 09:00 UTC

const sign = (userId: string, secret: string) => createHmac('sha256', secret).update(userId).digest('hex').slice(0, 32);

export default async () => {
  const env = process.env;
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'DIGEST_FROM', 'DIGEST_SECRET', 'URL'].filter((k) => !env[k]);
  if (missing.length) return new Response(`not configured: ${missing.join(', ')}`, { status: 200 });
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const { data: prefs, error } = await db.from('notification_prefs').select('user_id, tz, last_digest_at').eq('email_digest', true);
  if (error) return new Response(`read failed: ${error.message}`, { status: 500 });
  if (!prefs?.length) return new Response('no subscribers');

  const ids = prefs.map((p) => p.user_id as string);
  const { data: rows } = await db.from('user_data').select('user_id, store_name, data').in('store_name', ['quran-reviews', 'quran-stats']).in('user_id', ids);
  const byUser = new Map<string, Record<string, Record<string, unknown>>>();
  for (const r of rows ?? []) {
    const u = byUser.get(r.user_id) ?? {};
    u[r.store_name] = r.data;
    byUser.set(r.user_id, u);
  }

  let sent = 0;
  const now = Date.now();
  for (const p of prefs) {
    const data = byUser.get(p.user_id) ?? {};
    const due = dueToday(data['quran-reviews'] as never, p.tz, now);
    const away = daysAway(data['quran-stats']?.lastActiveDate as string | undefined, p.tz, now);
    if (!wantsDigest({ daysAway: away, due, lastDigestAt: p.last_digest_at ? Date.parse(p.last_digest_at) : null, now })) continue;

    const { data: user } = await db.auth.admin.getUserById(p.user_id);
    const email = user?.user?.email;
    if (!email) continue;

    const unsubscribe = `${env.URL}/.netlify/functions/digest-unsubscribe?u=${p.user_id}&t=${sign(p.user_id, env.DIGEST_SECRET!)}`;
    const what = [due.lessons && `${due.lessons} ${due.lessons === 1 ? 'lesson' : 'lessons'}`, due.ayahs && `${due.ayahs} ${due.ayahs === 1 ? 'ayah' : 'ayahs'}`].filter(Boolean).join(' and ');
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#1f2933">
        <p>Assalamu alaikum,</p>
        <p>It's been ${away} days since you last opened Takrar, and ${what} ${due.lessons + due.ayahs === 1 ? 'is' : 'are'} waiting for review.</p>
        <p>What you've memorized fades without revision. A few minutes today brings it back.</p>
        <p><a href="${env.URL}/review" style="display:inline-block;background:#1B4D5C;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Review now</a></p>
        <p style="font-size:12px;color:#6b7280">You turned on this weekly email in Takrar's settings. <a href="${unsubscribe}">Stop these emails</a>.</p>
      </div>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.DIGEST_FROM, to: email, subject: `${what} waiting in Takrar`, html,
        headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    });
    if (res.ok) {
      sent++;
      await db.from('notification_prefs').update({ last_digest_at: new Date(now).toISOString() }).eq('user_id', p.user_id);
    }
  }
  return new Response(`sent ${sent} of ${prefs.length}`);
};
