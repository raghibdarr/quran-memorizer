-- Khatm circles (roadmap #18): a family or halaqah shares a khatm, each member
-- claiming juz and marking them read. Members see only their own circles. People
-- appear by the name they choose for the circle, never by email.

create table if not exists circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  join_code text not null unique,
  round int not null default 1,
  -- The circle outlives its creator: on account deletion it simply has none
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists circle_members (
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table if not exists circle_claims (
  circle_id uuid not null references circles(id) on delete cascade,
  round int not null,
  juz int not null check (juz between 1 and 30),
  user_id uuid not null references auth.users(id) on delete cascade,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (circle_id, round, juz)
);

alter table circles enable row level security;
alter table circle_members enable row level security;
alter table circle_claims enable row level security;

-- Membership test that doesn't recurse through circle_members' own policy
create or replace function public.is_circle_member(c uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.circle_members m where m.circle_id = c and m.user_id = auth.uid());
$$;

create policy "members read their circles" on circles
  for select using (public.is_circle_member(id));
create policy "signed-in users create circles" on circles
  for insert with check (created_by = auth.uid());
create policy "the creator (or, once they've gone, any member) renames or advances a circle" on circles
  for update using (created_by = auth.uid() or (created_by is null and public.is_circle_member(id)));
create policy "the creator deletes a circle" on circles
  for delete using (created_by = auth.uid());

create policy "members see each other" on circle_members
  for select using (public.is_circle_member(circle_id));
create policy "members leave or rename themselves" on circle_members
  for delete using (user_id = auth.uid());
create policy "members rename themselves" on circle_members
  for update using (user_id = auth.uid());

create policy "members see claims" on circle_claims
  for select using (public.is_circle_member(circle_id));
create policy "members claim for themselves" on circle_claims
  for insert with check (user_id = auth.uid() and public.is_circle_member(circle_id));
create policy "members update their own claims" on circle_claims
  for update using (user_id = auth.uid());
create policy "members drop their own claims" on circle_claims
  for delete using (user_id = auth.uid());

-- Create a circle and join it as its first member, in one step
create or replace function public.create_circle(circle_name text, my_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  code text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.circles where join_code = code);
  end loop;
  insert into public.circles (name, join_code, created_by) values (circle_name, code, uid) returning id into new_id;
  insert into public.circle_members (circle_id, user_id, display_name) values (new_id, uid, my_name);
  return new_id;
end;
$$;

-- Join with a code someone shared (the code is the only way in)
create or replace function public.join_circle(code text, my_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  target uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select id into target from public.circles where join_code = upper(trim(code));
  if target is null then raise exception 'no circle with that code'; end if;
  insert into public.circle_members (circle_id, user_id, display_name)
    values (target, uid, my_name)
    on conflict (circle_id, user_id) do update set display_name = excluded.display_name;
  return target;
end;
$$;

revoke all on function public.create_circle(text, text) from public, anon;
revoke all on function public.join_circle(text, text) from public, anon;
grant execute on function public.create_circle(text, text) to authenticated;
grant execute on function public.join_circle(text, text) to authenticated;
grant execute on function public.is_circle_member(uuid) to authenticated;
