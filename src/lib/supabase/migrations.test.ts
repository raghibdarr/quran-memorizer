import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

// Every migration in supabase/migrations applied in order to a real Postgres
// (PGlite, in-process) with stand-ins for Supabase's auth schema and roles, then
// the row-level security and functions exercised as different signed-in users.

const DIR = path.resolve(__dirname, '../../../supabase/migrations');
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

let db: PGlite;

async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}
const refused = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${A}'), ('${B}'), ('${C}');
  `);
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(DIR, f), 'utf8'));
  }
  // Supabase grants table access to the API roles; RLS then decides rows
  await db.exec(`grant usage on schema public to authenticated, anon; grant select, insert, update, delete on all tables in schema public to authenticated;`);
}, 60_000);

describe('supabase migrations', () => {
  it('khatm circles: members only, claims in your own name, joins by code', async () => {
    const [{ id }] = await as<{ id: string }>(A, `select public.create_circle('Family khatm', 'Amina') as id`);
    const [{ join_code: code }] = await as<{ join_code: string }>(A, `select join_code from circles where id = $1`, [id]);
    expect(code).toMatch(/^[0-9A-F]{6}$/);
    expect(await as(B, `select * from circles`)).toHaveLength(0);

    await as(B, `select public.join_circle($1, 'Bilal')`, [code.toLowerCase()]);
    expect((await as<{ display_name: string }>(B, `select display_name from circle_members where circle_id = $1 order by joined_at`, [id])).map((r) => r.display_name)).toEqual(['Amina', 'Bilal']);

    await as(A, `insert into circle_claims (circle_id, round, juz, user_id) values ($1, 1, 1, $2)`, [id, A]);
    await as(B, `insert into circle_claims (circle_id, round, juz, user_id) values ($1, 1, 2, $2)`, [id, B]);
    expect(await refused(() => as(B, `insert into circle_claims (circle_id, round, juz, user_id) values ($1, 1, 3, $2)`, [id, A]))).toBe(true);
    await as(B, `update circle_claims set done = true where circle_id = $1 and juz in (1, 2)`, [id]);
    expect((await as<{ juz: number; done: boolean }>(A, `select juz, done from circle_claims where circle_id = $1 order by juz`, [id]))).toEqual([{ juz: 1, done: false }, { juz: 2, done: true }]);

    expect(await as(C, `select * from circle_claims`)).toHaveLength(0);
    expect(await refused(() => as(C, `select public.join_circle('ZZZZZZ', 'Cara')`))).toBe(true);
    await as(B, `update circles set round = 2 where id = $1`, [id]);
    expect((await as<{ round: number }>(A, `select round from circles where id = $1`, [id]))[0].round).toBe(1);
    expect(await refused(() => as(null, `select public.create_circle('x', 'y')`))).toBe(true);
  });

  it('delete_my_account removes the user and everything of theirs', async () => {
    await as(C, `insert into user_data (user_id, store_name, data) values ($1, 'quran-progress', '{}')`, [C]);
    const [{ id }] = await as<{ id: string }>(C, `select public.create_circle('Mine', 'Cara') as id`);
    await as(C, `select public.delete_my_account()`);
    expect(await as(A, `select * from user_data where user_id = $1`, [C])).toHaveLength(0);
    expect((await db.query(`select * from auth.users where id = $1`, [C])).rows).toHaveLength(0);
    // A circle outlives its creator
    expect((await db.query<{ created_by: string | null }>(`select created_by from circles where id = $1`, [id])).rows[0].created_by).toBeNull();
    expect(await refused(() => as(null, `select public.delete_my_account()`))).toBe(true);
  });
});
