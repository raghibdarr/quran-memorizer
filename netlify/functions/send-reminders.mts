// Hourly web push reminders (M8). For every browser subscription whose chosen local
// hour is now, and that hasn't had today's reminder, send one if the user has reviews
// due today (from their synced data). Dead subscriptions (404/410) are removed.
//
// Netlify env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//              NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { dueToday, localDate, localHour, reminderText } from '../../src/lib/notify-summary';

export const config = { schedule: '@hourly' };

interface Sub { endpoint: string; user_id: string; p256dh: string; auth: string; tz: string; reminder_hour: number; last_sent_on: string | null }

export default async () => {
  const env = process.env;
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'].filter((k) => !env[k]);
  if (missing.length) return new Response(`not configured: ${missing.join(', ')}`, { status: 200 });

  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const { data: subs, error } = await db.from('push_subscriptions').select('*');
  if (error) return new Response(`read failed: ${error.message}`, { status: 500 });

  const now = Date.now();
  const dueNow = (subs as Sub[]).filter((s) => localHour(s.tz, now) === s.reminder_hour && s.last_sent_on !== localDate(s.tz, now));
  if (dueNow.length === 0) return new Response('nothing to send');

  const userIds = [...new Set(dueNow.map((s) => s.user_id))];
  const { data: rows } = await db.from('user_data').select('user_id, data').eq('store_name', 'quran-reviews').in('user_id', userIds);
  const reviews = new Map((rows ?? []).map((r) => [r.user_id as string, r.data]));

  let sent = 0, pruned = 0;
  for (const s of dueNow) {
    const due = dueToday(reviews.get(s.user_id), s.tz, now);
    const today = localDate(s.tz, now);
    if (due.lessons + due.ayahs > 0) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ ...reminderText(due), url: '/review' }),
          { TTL: 6 * 3600 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          pruned++;
          continue;
        }
      }
    }
    // Marked even when nothing was due, so the hour isn't re-checked all day
    await db.from('push_subscriptions').update({ last_sent_on: today }).eq('endpoint', s.endpoint);
  }
  return new Response(`sent ${sent}, pruned ${pruned}, checked ${dueNow.length}`);
};
