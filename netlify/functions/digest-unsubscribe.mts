// One-click unsubscribe from the weekly digest (the link in every digest email, and the
// List-Unsubscribe header). The token is an HMAC of the user id, so a link only ever
// turns off its own recipient's email.
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const page = (msg: string) => new Response(
  `<!doctype html><meta name="viewport" content="width=device-width"><title>Takrar</title>
   <div style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;text-align:center;color:#1f2933">
   <p>${msg}</p><p><a href="/" style="color:#1B4D5C">Open Takrar</a></p></div>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

export default async (req: Request) => {
  const env = process.env;
  const url = new URL(req.url);
  const u = url.searchParams.get('u') ?? '';
  const t = url.searchParams.get('t') ?? '';
  if (!env.DIGEST_SECRET || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return page('This link is not available right now.');
  const expected = createHmac('sha256', env.DIGEST_SECRET).update(u).digest('hex').slice(0, 32);
  if (t.length !== expected.length || !timingSafeEqual(Buffer.from(t), Buffer.from(expected))) return page('This link is not valid.');

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await db.from('notification_prefs').update({ email_digest: false, updated_at: new Date().toISOString() }).eq('user_id', u);
  return page('Done. You won’t get the weekly email any more. You can turn it back on in Settings.');
};
