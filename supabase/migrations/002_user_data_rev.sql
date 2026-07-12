-- M2: optimistic-concurrency revision counter for compare-and-set sync pushes.
-- A client may only update a row whose rev it has seen (update ... where rev = expected);
-- zero rows updated = another device wrote first -> client re-fetches, re-merges, retries.
--
-- APPLY THIS in the Supabase dashboard (SQL editor) or via `supabase db push`
-- BEFORE deploying the M2 client. The client falls back to legacy upserts (with a
-- console warning) if the column is missing, so ordering is safe either way.

alter table user_data add column if not exists rev bigint not null default 0;
