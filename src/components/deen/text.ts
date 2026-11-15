// Small pure helpers for the deen components: authored segments, grading
// labels, the errata log and the problem report message.

import type { Grading } from '@/types/deen';
import { daysBetween, isoFromMs, todayIso } from '@/lib/dates';
import { scholarName, workTitle } from './registry-names';

/**
 * Split Arabic into its authored segments. `ends` are character offsets where
 * each segment ends (spec 5.3); an offset that lands inside a word is moved to
 * that word's end, so a segment never cuts a word. Without offsets the text is
 * one segment.
 */
export function splitSegments(arabic: string, ends?: number[]): string[] {
  const text = arabic.trim();
  if (!ends?.length) return text ? [text] : [];
  const out: string[] = [];
  let start = 0;
  for (const raw of ends) {
    let end = Math.min(Math.max(raw, start), text.length);
    while (end < text.length && !/\s/.test(text[end])) end++;
    const part = text.slice(start, end).trim();
    if (part) out.push(part);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Arabic words (whitespace-separated) */
export const arabicWords = (text: string) => text.split(/\s+/).filter(Boolean);

/** A word after which a reader naturally pauses: Arabic or Latin punctuation, or a Quranic pause mark */
const PAUSE = /[،؛.:!?۔ۖۗۘۙۚۛۜ]$/;

/**
 * Parts to learn a text by when none were authored: a short text stays whole;
 * a longer one is cut into even runs of about `size` words, ending a run early
 * at a pause when one falls near the cut. Never leaves a tail under 3 words.
 */
export function autoChunks(text: string, size = 8): string[] {
  const words = arabicWords(text);
  if (words.length <= size + 2) return words.length ? [words.join(' ')] : [];
  const target = Math.ceil(words.length / Math.ceil(words.length / size));
  const out: string[] = [];
  let cur: string[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const left = words.length - i - 1;
    if (left === 0) return;
    const atPause = PAUSE.test(w) && cur.length >= Math.max(3, target - 2);
    if (left >= 3 && (atPause || cur.length >= target)) {
      out.push(cur.join(' '));
      cur = [];
    }
  });
  if (cur.length) out.push(cur.join(' '));
  return out;
}

/** The Build parts of a text: its authored segments, else automatic ones */
export function learnParts(arabic: string, ends?: number[]): string[] {
  return ends?.length ? splitSegments(arabic, ends) : autoChunks(arabic);
}

export const GRADE_LABEL: Record<Grading['grade'], string> = {
  sahih: 'Sahih',
  hasan: 'Hasan',
  daif: "Da'if",
  mawquf: 'Mawquf',
  mursal: 'Mursal',
  'agreed-upon': 'Agreed upon',
  'in-sahih': 'In a Sahih collection',
};

/** The glossary term that explains a grade, where the core glossary has one */
export const GRADE_TERM: Partial<Record<Grading['grade'], string>> = {
  sahih: 'sahih',
  hasan: 'hasan',
  daif: 'daif',
  mawquf: 'mawquf',
  mursal: 'mursal',
};

/** "Hasan: al-Tirmidhi, in al-Jami', after the hadith" (spec 5.1) */
export function gradingText(g: Grading): string {
  return `${GRADE_LABEL[g.grade]}: ${scholarName(g.by)}, in ${workTitle(g.in)}`;
}

/**
 * The date an item's text was last corrected, from content/deen/ERRATA.md.
 * An entry is a line holding an ISO date and the item as `<deck>:<itemId>`
 * (e.g. "- 2026-12-01 · nawawi40:02 rev 2: …"). Newest entry wins.
 */
export function correctionDate(errata: string, deck: string, itemId: string): string | null {
  const key = `${deck}:${itemId}`;
  let best: string | null = null;
  for (const line of errata.split('\n')) {
    if (!new RegExp(`(^|[^\\w-])${key.replace(/[-]/g, '\\-')}(?![\\w-])`).test(line)) continue;
    const date = line.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (date && (!best || date > best)) best = date;
  }
  return best;
}

/** "1 December 2026" from "2026-12-01" (no timezone shift) */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The prefilled problem report (spec 5.6): item id and rev, room for the reader */
export function reportMessage(itemId: string, rev: number, title?: string): { subject: string; body: string } {
  const subject = `Takrar: a problem with ${itemId} (rev ${rev})`;
  const body = [
    `Item: ${itemId}`,
    `Revision: ${rev}`,
    ...(title ? [`Title: ${title}`] : []),
    '',
    'What looks wrong (the Arabic, the translation, the reference or the grading):',
    '',
    '',
    'Where you checked it, if you did:',
    '',
  ].join('\n');
  return { subject, body };
}

export function mailtoHref(email: string, msg: { subject: string; body: string }): string {
  return `mailto:${email}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`;
}

/** "tomorrow", "in 3 days", "in about 2 weeks" from a (midnight-aligned) due date */
export function whenLabel(ts: number, today = todayIso()): string {
  const days = daysBetween(today, isoFromMs(ts));
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'in about a week';
  if (days < 30) return `in about ${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30);
  return `in about ${months} month${months === 1 ? '' : 's'}`;
}
