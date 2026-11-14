'use client';

import { useEffect, useState } from 'react';
import type { Ayah } from '@/types/quran';
import type { DeckKind, GlossaryTerm, Lesson, NameItem, TextItem } from '@/types/deen';
import { parseCardId } from '@/lib/deen/cards';
import { loadGlossary } from '@/lib/deen/glossary';
import { ASK_A_SCHOLAR } from '@/lib/deen/flags';
import { getSurah } from '@/lib/quran-data';
import ArabicText from '@/components/ui/arabic-text';
import { deckKindOf, deckTitleOf, getItem, GLOSSARY_DECK } from './deck-source';
import { CueText, ItemArabic } from './cue-text';
import { RichText } from './term';
import { SCHOOL_NAME } from './positions-table';
import { citationText } from './registry-names';
import type { School } from '@/types/deen';

export type CardContent =
  | { kind: 'term'; facet: string; term: GlossaryTerm; rev: number }
  | { kind: 'names'; facet: string; item: NameItem; rev: number }
  | { kind: 'course'; facet: string; lesson: Lesson; rev: number }
  | { kind: 'hadith' | 'dhikr'; facet: string; item: TextItem; rev: number; ayahs?: Ayah[] };

/** What a card shows, loaded from its deck (null when the deck or item is gone) */
export async function loadCardContent(id: string): Promise<CardContent | null> {
  const p = parseCardId(id);
  if (!p) return null;
  if (p.deck === GLOSSARY_DECK) {
    const term = (await loadGlossary()).get(p.itemId);
    return term ? { kind: 'term', facet: p.facet, term, rev: 1 } : null;
  }
  const kind: DeckKind | null = deckKindOf(p.deck);
  if (!kind) return null;
  const item = await getItem(p.deck, p.itemId);
  if (!item) return null;
  if (kind === 'names') return { kind, facet: p.facet, item: item as NameItem, rev: item.rev };
  if (kind === 'course') {
    const lesson = item as Lesson;
    return lesson.claims?.some((c) => c.cards.some((k) => k.id === p.facet)) ? { kind, facet: p.facet, lesson, rev: lesson.rev } : null;
  }
  const text = item as TextItem;
  let ayahs: Ayah[] | undefined;
  if (text.quran) {
    const s = await getSurah(text.quran.surahId);
    const end = text.quran.ayahEnd ?? text.quran.ayah;
    ayahs = s.ayahs.filter((a) => a.number >= text.quran!.ayah && a.number <= end);
  }
  return { kind, facet: p.facet, item: text, rev: text.rev, ayahs };
}

export function useCardContent(id: string | undefined): { content: CardContent | null; loading: boolean } {
  const [state, setState] = useState<{ id?: string; content: CardContent | null }>({ content: null });
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadCardContent(id)
      .catch(() => null)
      .then((content) => live && setState({ id, content }));
    return () => {
      live = false;
    };
  }, [id]);
  return { content: state.id === id ? state.content : null, loading: !!id && state.id !== id };
}

/** A short label for the kind of question, shown above the card */
export function cardKindLabel(c: CardContent): string {
  if (c.kind === 'term') return 'Term';
  if (c.kind === 'names') return c.facet === 'en-ar' ? 'Name of Allah · which Name?' : 'Name of Allah · meaning';
  if (c.kind === 'course') return 'Fact';
  return { recall: 'From memory', meaning: 'Meaning', narrator: 'Narrator', usage: 'When it is said' }[c.facet] ?? 'Review';
}

function Prompt({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-foreground">{children}</p>;
}

function TextArabic({ item, ayahs }: { item: TextItem; ayahs?: Ayah[] }) {
  if (ayahs?.length) return <div className="space-y-2">{ayahs.map((a) => <ArabicText key={a.key} ayah={a} className="text-2xl" />)}</div>;
  return item.arabic ? <ItemArabic text={item.arabic} /> : null;
}

/** The question side */
export function CardFront({ content, hint }: { content: CardContent; hint?: boolean }) {
  const c = content;
  if (c.kind === 'term') {
    return (
      <div className="space-y-2">
        <p className="text-2xl font-bold text-foreground">{c.term.translit}</p>
        <p className="arabic-text text-2xl text-teal" style={{ textAlign: 'center' }} lang="ar">{c.term.arabic}</p>
        <Prompt>What does it mean?</Prompt>
      </div>
    );
  }
  if (c.kind === 'names') {
    return c.facet === 'en-ar' ? (
      <div className="space-y-2">
        <p className="text-lg font-semibold text-foreground">{c.item.meaning}</p>
        <Prompt>Which Name is this?</Prompt>
      </div>
    ) : (
      <div className="space-y-2">
        <ItemArabic text={c.item.arabic} className="text-[2rem]" />
        <Prompt>What does this Name mean?</Prompt>
      </div>
    );
  }
  if (c.kind === 'course') {
    const card = c.lesson.claims.flatMap((cl) => cl.cards).find((k) => k.id === c.facet)!;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted">{c.lesson.title}</p>
        {card.school && <p className="text-xs font-semibold text-teal">{SCHOOL_NAME[card.school as School] ?? card.school}</p>}
        <p className="text-base font-semibold leading-relaxed text-foreground">
          <RichText text={card.front} />
        </p>
      </div>
    );
  }
  const { item, ayahs } = c;
  switch (c.facet) {
    case 'recall':
      return (
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">{item.title}</p>
          <p className="text-xs text-muted">{item.cue}</p>
          <Prompt>Recite it from memory</Prompt>
          {hint && item.arabic && <CueText text={item.arabic} className="pt-2 text-2xl" />}
        </div>
      );
    case 'narrator':
      return (
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">{item.title}</p>
          {item.translation && (
            <p className="line-clamp-4 text-start text-sm leading-relaxed text-muted">
              <RichText text={item.translation} />
            </p>
          )}
          <Prompt>Who narrated it?</Prompt>
        </div>
      );
    case 'usage':
      return (
        <div className="space-y-2">
          <TextArabic item={item} ayahs={ayahs} />
          {!item.arabic && !ayahs?.length && <p className="text-base font-semibold text-foreground">{item.title}</p>}
          <Prompt>When is it said?</Prompt>
        </div>
      );
    default:
      return (
        <div className="space-y-2">
          <TextArabic item={item} ayahs={ayahs} />
          {!item.arabic && !ayahs?.length && <p className="text-base font-semibold text-foreground">{item.title}</p>}
          <Prompt>What does it mean?</Prompt>
        </div>
      );
  }
}

/** The answer side */
export function CardBack({ content }: { content: CardContent }) {
  const c = content;
  if (c.kind === 'term') {
    return <p className="text-sm leading-relaxed text-foreground">{c.term.short}</p>;
  }
  if (c.kind === 'names') {
    return c.facet === 'en-ar' ? (
      <div className="space-y-1">
        <ItemArabic text={c.item.arabic} className="text-[2rem]" />
        <p className="text-center text-sm font-semibold text-foreground">{c.item.transliteration}</p>
      </div>
    ) : (
      <div className="space-y-1 text-center">
        <p className="text-sm font-semibold text-foreground">{c.item.transliteration}</p>
        <p className="text-base text-foreground">{c.item.meaning}</p>
      </div>
    );
  }
  if (c.kind === 'course') {
    const claim = c.lesson.claims.find((cl) => cl.cards.some((k) => k.id === c.facet))!;
    const card = claim.cards.find((k) => k.id === c.facet)!;
    const others = card.school ? claim.cards.filter((k) => k.school && k.school !== card.school) : [];
    return (
      <div className="space-y-3 text-start">
        <p className="text-[15px] leading-relaxed text-foreground">
          <RichText text={card.back} />
        </p>
        {others.length > 0 && (
          <div className="rounded-xl bg-foreground/[0.04] px-3 py-2.5">
            <p className="text-xs font-semibold text-muted">Also held</p>
            <ul className="mt-1 space-y-1 text-sm text-foreground">
              {others.map((o) => (
                <li key={o.id}>
                  <span className="font-semibold">{SCHOOL_NAME[o.school as School] ?? o.school}:</span> <RichText text={o.back} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted">{ASK_A_SCHOLAR}</p>
      </div>
    );
  }
  const { item, ayahs } = c;
  switch (c.facet) {
    case 'recall':
      return <TextArabic item={item} ayahs={ayahs} />;
    case 'narrator': {
      const names = [...new Set(item.citations.map((x) => x.narrator).filter(Boolean))];
      return (
        <div className="space-y-1 text-center">
          <p className="text-base font-semibold text-foreground">{names.join(' · ') || 'Not recorded'}</p>
          {item.citations[0] && <p className="text-xs text-muted">{citationText(item.citations[0])}</p>}
        </div>
      );
    }
    case 'usage':
      return (
        <div className="space-y-1 text-start text-sm text-foreground">
          <ul className="space-y-0.5">
            {(item.usage?.when ?? []).map((w) => (
              <li key={w}>
                <RichText text={w} />
              </li>
            ))}
          </ul>
          {item.usage?.repeat && item.usage.repeat > 1 && <p className="text-xs text-muted">Said {item.usage.repeat} times</p>}
        </div>
      );
    default:
      return (
        <p className="text-start text-[15px] leading-relaxed text-foreground">
          <RichText text={item.translation ?? ''} />
        </p>
      );
  }
}

export { deckTitleOf };
