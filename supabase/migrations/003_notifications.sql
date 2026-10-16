-- M8: web push reminders and the weekly email digest.
--
-- APPLY THIS in the Supabase dashboard (SQL editor) or via `supabase db push`.
-- Until it's applied, the reminder and digest switches in Settings say they couldn't
-- be saved; nothing else in the app depends on these tables.
--
-- The senders are Netlify scheduled functions (netlify/functions/) using the
-- service-role key, which bypasses RLS; users only ever see their own rows.

-- One row per browser that asked for reminders
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  p256dh text not null,
  auth text not null,
  tz text not null default 'UTC',          -- IANA zone, e.g. Europe/London
  reminder_hour smallint not null default 19 check (reminder_hour between 0 and 23),
  last_sent_on date,                        -- local date of the last reminder, so one a day
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;
create policy "Users manage own push subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Email digest preference (opt-in) and bookkeeping
create table if not exists notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_digest boolean not null default false,
  tz text not null default 'UTC',
  last_digest_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table notification_prefs enable row level security;
create policy "Users manage own notification prefs"
  on notification_prefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
