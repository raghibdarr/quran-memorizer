-- User data storage — one row per user per store
-- Each Zustand store syncs its full state as a JSONB blob
create table user_data (
  user_id uuid references auth.users(id) on delete cascade not null,
  store_name text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, store_name)
);

-- Index for fast lookups by user
create index idx_user_data_user_id on user_data(user_id);

-- Auto-update the updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_data_updated_at
  before update on user_data
  for each row
  execute function update_updated_at();

-- Row-Level Security: users can only access their own data
alter table user_data enable row level security;

create policy "Users manage own data"
  on user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
