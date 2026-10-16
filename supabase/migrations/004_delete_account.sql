-- In-app account deletion (store requirement: Apple 5.1.1(v), Google Play account deletion).
-- A signed-in user deletes their own auth user; their rows in user_data,
-- push_subscriptions and notification_prefs go with it (on delete cascade).
-- Runs as the function owner because clients can't touch auth.users directly.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
