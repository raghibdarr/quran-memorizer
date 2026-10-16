'use client';

import { useEffect, useState } from 'react';
import BottomSheet from '@/components/ui/bottom-sheet';

/**
 * Tajweed explainer (M10): tap a coloured letter anywhere tajweed text is shown to
 * see which rule it marks. One listener for the whole app, so every screen that
 * renders tajweed markup gets it; taps inside buttons and links (word tiles, cards
 * that play audio) keep doing what they do.
 */

interface Rule { name: string; detail: string; color: string }

const SILENT = '#AAAAAA', GREEN = '#2ECC71';
export const TAJWEED_RULE_INFO: Record<string, Rule> = {
  ham_wasl: { name: 'Hamzat al-wasl (connecting alif)', detail: 'Pronounced only when you begin reading from this word. Joined to the word before, it is silent.', color: SILENT },
  laam_shamsiyah: { name: 'Lām shamsiyyah (sun letter)', detail: 'The lām of "al-" is not pronounced; the next letter is doubled instead, so ٱلشَّمْس is read ash-shams.', color: SILENT },
  slnt: { name: 'Silent letter', detail: 'Written in the muṣḥaf but not pronounced.', color: SILENT },
  madda_normal: { name: 'Natural madd (2 counts)', detail: 'A long vowel held for 2 counts, no more.', color: '#E07DB3' },
  madda_permissible: { name: 'Permissible madd (2, 4 or 6 counts)', detail: 'A madd letter, or a leen letter (و or ي with a sukūn after a fatḥah), before a letter you make silent by stopping. It may be held 2, 4 or 6 counts; keep it consistent.', color: '#E67E22' },
  madda_obligatory: { name: 'Madd before a hamzah (4 or 5 counts)', detail: 'A madd letter followed by a hamzah, in the same word (connected madd) or at the start of the next (separated madd). In Ḥafṣ both are held 4 or 5 counts.', color: '#DB2777' },
  madda_necessary: { name: 'Necessary madd (6 counts)', detail: 'A madd letter followed by a permanent sukūn or shaddah, as in ٱلضَّآلِّينَ. Always 6 counts.', color: '#E74C3C' },
  ghunnah: { name: 'Ghunnah (nasal sound)', detail: 'Nūn or mīm with a shaddah: hold the nasal sound for about 2 counts.', color: GREEN },
  ikhafa: { name: 'Ikhfāʾ (hiding)', detail: 'Nūn sākinah or tanwīn before one of fifteen letters: the n sound is hidden in a nasal sound held about 2 counts.', color: GREEN },
  ikhafa_shafawi: { name: 'Ikhfāʾ shafawī (lip hiding)', detail: 'Mīm sākinah before bāʾ: the mīm is hidden with a nasal sound, lips lightly together.', color: GREEN },
  idgham_ghunnah: { name: 'Idghām with ghunnah (merging)', detail: 'Nūn sākinah or tanwīn before ي ن م و (in another word): it merges into that letter, with a nasal sound.', color: GREEN },
  idgham_shafawi: { name: 'Idghām shafawī (mīm into mīm)', detail: 'Mīm sākinah followed by mīm: the two merge, with a nasal sound.', color: GREEN },
  idgham_wo_ghunnah: { name: 'Idghām without ghunnah', detail: 'Nūn sākinah or tanwīn before ل or ر: it merges fully into that letter, with no nasal sound.', color: SILENT },
  idgham_mutajanisayn: { name: 'Idghām mutajānisayn', detail: 'Two letters from the same point of articulation, like ت into ط: the first merges into the second.', color: SILENT },
  idgham_mutaqaribayn: { name: 'Idghām mutaqāribayn', detail: 'Two letters from close points of articulation, like ل into ر: the first merges into the second.', color: SILENT },
  iqlab: { name: 'Iqlāb (changing)', detail: 'Nūn sākinah or tanwīn before بـ: the n turns into a mīm sound, with a nasal sound. The small mīm marks it.', color: GREEN },
  qalaqah: { name: 'Qalqalah (echo)', detail: 'ق ط ب ج د with a sukūn: let the letter bounce with a slight echo.', color: '#36D7E4' },
};

export default function TajweedExplainer() {
  const [rule, setRule] = useState<{ info: Rule; text: string } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const mark = target?.closest?.('.tajweed-text tajweed[class]');
      if (!mark || mark.closest('button, a, [role="button"], [role="tab"]')) return;
      const info = TAJWEED_RULE_INFO[mark.getAttribute('class') ?? ''];
      if (info) setRule({ info, text: mark.textContent ?? '' });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <BottomSheet open={!!rule} onClose={() => setRule(null)} title={rule?.info.name ?? 'Tajweed'}>
      {rule && (
        <div className="space-y-3 pb-2">
          <div dir="rtl" className="flex items-center gap-3">
            <span className="arabic-text text-4xl" style={{ color: rule.info.color }}>{rule.text}</span>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: rule.info.color }} aria-hidden />
          </div>
          <p className="text-sm leading-relaxed text-foreground">{rule.info.detail}</p>
        </div>
      )}
    </BottomSheet>
  );
}
