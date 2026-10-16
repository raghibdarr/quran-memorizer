'use client';

// Khatm circles (roadmap #18) over Supabase (migration 005). Every call needs the
// person signed in; row-level security limits them to circles they belong to.

import { createClient } from '@/lib/supabase/client';
import type { CircleClaimRow, CircleMemberRow, CircleRow } from '@/lib/supabase/types';

export interface CircleView {
  circle: CircleRow;
  members: CircleMemberRow[];
  claims: CircleClaimRow[];
}

const db = () => createClient();

async function me(): Promise<string> {
  const { data } = await db().auth.getUser();
  if (!data.user) throw new Error('signed-out');
  return data.user.id;
}

export async function myCircles(): Promise<(CircleRow & { done: number })[]> {
  const { data, error } = await db().from('circles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const circles = data ?? [];
  if (!circles.length) return [];
  const { data: claims } = await db().from('circle_claims').select('circle_id, round, done').in('circle_id', circles.map((c) => c.id));
  return circles.map((c) => ({ ...c, done: (claims ?? []).filter((k) => k.circle_id === c.id && k.round === c.round && k.done).length }));
}

export async function createCircle(name: string, myName: string): Promise<string> {
  const { data, error } = await db().rpc('create_circle', { circle_name: name.trim(), my_name: myName.trim() });
  if (error) throw error;
  return data as string;
}

export async function joinCircle(code: string, myName: string): Promise<string> {
  const { data, error } = await db().rpc('join_circle', { code: code.trim().toUpperCase(), my_name: myName.trim() });
  if (error) throw error;
  return data as string;
}

export async function loadCircle(id: string): Promise<CircleView | null> {
  const { data: circle } = await db().from('circles').select('*').eq('id', id).maybeSingle();
  if (!circle) return null;
  const [{ data: members }, { data: claims }] = await Promise.all([
    db().from('circle_members').select('*').eq('circle_id', id).order('joined_at'),
    db().from('circle_claims').select('*').eq('circle_id', id).eq('round', circle.round),
  ]);
  return { circle, members: members ?? [], claims: claims ?? [] };
}

export async function claimJuz(circleId: string, round: number, juz: number) {
  const { error } = await db().from('circle_claims').insert({ circle_id: circleId, round, juz, user_id: await me() });
  if (error) throw error;
}

export async function setJuzDone(circleId: string, round: number, juz: number, done: boolean) {
  const { error } = await db().from('circle_claims').update({ done, updated_at: new Date().toISOString() })
    .eq('circle_id', circleId).eq('round', round).eq('juz', juz);
  if (error) throw error;
}

export async function dropJuz(circleId: string, round: number, juz: number) {
  const { error } = await db().from('circle_claims').delete().eq('circle_id', circleId).eq('round', round).eq('juz', juz);
  if (error) throw error;
}

/** Creator only: every juz read, start the circle's next khatm */
export async function nextRound(c: CircleRow) {
  const { error } = await db().from('circles').update({ round: c.round + 1 }).eq('id', c.id);
  if (error) throw error;
}

export async function leaveCircle(circleId: string) {
  const { error } = await db().from('circle_members').delete().eq('circle_id', circleId).eq('user_id', await me());
  if (error) throw error;
}

export async function myId(): Promise<string | null> {
  const { data } = await db().auth.getUser();
  return data.user?.id ?? null;
}
