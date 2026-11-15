'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/app-link';
import { getItem } from '@/components/deen/deck-source';
import { useItemState } from '@/components/deen/item-state';
import { AdhkarItemCard } from '@/components/adhkar/item-card';
import type { TextItem } from '@/types/deen';

/**
 * "At iftar" on /ramadan (spec 6): the audited duas-daily:iftar item through the
 * adhkar deck's own card, so its citation, attributed grading and review status
 * come with it; "Dhahaba al-zama'" is the item, and "Allahumma laka sumtu" sits
 * under it as its variant with the mursal status attributed to al-Nawawi. Then
 * the course's Fasting unit, one tap away.
 */
export default function IftarDua() {
  const [item, setItem] = useState<TextItem | null>(null);
  const state = useItemState('duas-daily', 'iftar');
  useEffect(() => {
    let live = true;
    getItem<TextItem>('duas-daily', 'iftar')
      .then((i) => live && setItem(i))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-labelledby="iftar-dua-title" className="space-y-2" data-iftar-dua>
      <h2 id="iftar-dua-title" className="px-1 text-base font-bold text-foreground">
        At iftar
      </h2>
      {item ? <AdhkarItemCard item={item} state={state} /> : <div className="h-48 rounded-2xl border border-foreground/10 bg-card" aria-hidden />}
      <Link
        href="/course#unit-course-fasting"
        className="pressable flex min-h-12 items-center justify-between rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5 text-sm"
        data-fasting-course
      >
        <span>
          <span className="font-semibold text-teal">Fasting in seven short lessons</span>
          <span className="text-muted"> · with where the schools differ</span>
        </span>
        <span aria-hidden className="text-teal">›</span>
      </Link>
    </section>
  );
}
