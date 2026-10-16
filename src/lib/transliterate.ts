/**
 * English transliteration of Tanzil's Uthmani text, written by us (licensing audit,
 * 2026-10-16: the word transliterations came from api.quran.com and the ayah ones from
 * QUL, neither of which we may bundle). scripts/build-transliteration.mts writes it into
 * src/data.
 *
 * Reader-friendly, not scholarly: long vowels doubled (aa, ee, oo), no dots under letters,
 * ʿayn and a mid-word hamza as an apostrophe. A word on its own is read as if you start
 * on it (ٱللَّهُ is "allaahu"); an ayah is read the way it's recited, joined: the
 * connecting alif drops after a vowel ("huwal-laahu"), a long vowel before it shortens, a
 * nūn or tanwīn merges into a doubled next letter (idghām, "mir rabbihim") or turns to m
 * before b (iqlāb), and the last word stops (pausal form).
 */

const C = (n: number) => String.fromCharCode(n);

// Letters
const HAMZA = C(0x621), ALIF_MADDA = C(0x622), ALIF_HAMZA = C(0x623), WAW_HAMZA = C(0x624), ALIF_HAMZA_BELOW = C(0x625), YA_HAMZA = C(0x626);
const ALIF = C(0x627), TA_MARBUTA = C(0x629), ALIF_MAQSURA = C(0x649), WAW = C(0x648), YA = C(0x64a), LAM = C(0x644), NUN = C(0x646), MIM = C(0x645), BA = C(0x628), HA = C(0x647);
const ALIF_WASLA = C(0x671);
// Signs
const FATHATAN = C(0x64b), DAMMATAN = C(0x64c), KASRATAN = C(0x64d), FATHA = C(0x64e), DAMMA = C(0x64f), KASRA = C(0x650), SHADDA = C(0x651), SUKUN = C(0x652);
const MADDA = C(0x653), HAMZA_ABOVE = C(0x654), HAMZA_BELOW = C(0x655), DAGGER_ALIF = C(0x670), TATWEEL = C(0x640);
const SMALL_ZERO = C(0x6df), SMALL_RECT_ZERO = C(0x6e0), SMALL_HIGH_MEEM = C(0x6e2), SMALL_LOW_MEEM = C(0x6ed), SMALL_WAW = C(0x6e5), SMALL_YA = C(0x6e6), SMALL_HIGH_YA = C(0x6e7), SMALL_HIGH_NOON = C(0x6e8);
const SMALL_SUKUN = C(0x6e1), OPEN_FATHATAN = C(0x8f0), OPEN_DAMMATAN = C(0x8f1), OPEN_KASRATAN = C(0x8f2);

const HAMZAS = new Set([HAMZA, ALIF_HAMZA, ALIF_HAMZA_BELOW, WAW_HAMZA, YA_HAMZA]);
const CONSONANT: Record<string, string> = {
  [BA]: 'b', [C(0x62a)]: 't', [C(0x62b)]: 'th', [C(0x62c)]: 'j', [C(0x62d)]: 'h', [C(0x62e)]: 'kh', [C(0x62f)]: 'd', [C(0x630)]: 'dh',
  [C(0x631)]: 'r', [C(0x632)]: 'z', [C(0x633)]: 's', [C(0x634)]: 'sh', [C(0x635)]: 's', [C(0x636)]: 'd', [C(0x637)]: 't', [C(0x638)]: 'z',
  [C(0x639)]: "'", [C(0x63a)]: 'gh', [C(0x641)]: 'f', [C(0x642)]: 'q', [C(0x643)]: 'k', [LAM]: 'l', [MIM]: 'm', [NUN]: 'n', [HA]: 'h',
  [WAW]: 'w', [YA]: 'y', [ALIF_MAQSURA]: 'y', [TA_MARBUTA]: 't', [HAMZA]: "'", [ALIF_HAMZA]: "'", [ALIF_HAMZA_BELOW]: "'", [WAW_HAMZA]: "'", [YA_HAMZA]: "'",
};
const VOWEL: Record<string, 'a' | 'i' | 'u'> = { [FATHA]: 'a', [KASRA]: 'i', [DAMMA]: 'u' };
const TANWEEN: Record<string, 'a' | 'i' | 'u'> = { [FATHATAN]: 'a', [KASRATAN]: 'i', [DAMMATAN]: 'u', [OPEN_FATHATAN]: 'a', [OPEN_KASRATAN]: 'i', [OPEN_DAMMATAN]: 'u' };
/** Pause marks, rub el hizb, sajdah and other signs that don't change the sound */
const IGNORED = new RegExp(`[ ${C(0x6d6)}-${C(0x6dc)}${C(0x6de)}${C(0x6e9)}${C(0x6ea)}-${C(0x6ec)}${MADDA}${C(0x200c)}${C(0x200f)}${C(0xa0)}]`, 'g');

/** The disjointed letters that open some surahs, by their bare letters */
const MUQATTAAT: Record<string, string> = {
  'الم': 'Alif-Laam-Meem', 'المص': 'Alif-Laam-Meem-Saad', 'الر': 'Alif-Laam-Raa', 'المر': 'Alif-Laam-Meem-Raa',
  'كهيعص': "Kaaf-Haa-Yaa-'Ayn-Saad", 'طه': 'Taa-Haa', 'طسم': 'Taa-Seen-Meem', 'طس': 'Taa-Seen', 'يس': 'Yaa-Seen',
  'ص': 'Saad', 'حم': 'Haa-Meem', 'عسق': "'Ayn-Seen-Qaaf", 'ق': 'Qaaf', 'ن': 'Noon',
};

interface Letter {
  ch: string;
  vowel: 'a' | 'i' | 'u' | null;
  tanween: 'a' | 'i' | 'u' | null;
  shadda: boolean;
  sukun: boolean;
  dagger: boolean;     // superscript alif: a long a
  silent: boolean;     // small rounded or rectangular zero
  smallWaw: boolean;   // ۥ: lengthens a damma
  smallYa: boolean;    // ۦ: lengthens a kasra
  meem: boolean;       // small meem: iqlāb, the n sound becomes m before b
  hamza: boolean;      // hamza sign on the letter
}
const blank = (ch: string): Letter => ({ ch, vowel: null, tanween: null, shadda: false, sukun: false, dagger: false, silent: false, smallWaw: false, smallYa: false, meem: false, hamza: false });

function letters(word: string): Letter[] {
  // A hamza written on a tatweel is a letter of its own (يَـُٔودُهُۥ, يَـٰٓـَٔادَمُ)
  const text = word
    .replace(new RegExp(`${TATWEEL}([${FATHA}${DAMMA}${KASRA}${SUKUN}]?)[${HAMZA_ABOVE}${HAMZA_BELOW}]`, 'g'), `${HAMZA}$1`)
    .replace(new RegExp(`${TATWEEL}`, 'g'), '')
    .replace(IGNORED, '');
  const out: Letter[] = [];
  for (const ch of text) {
    const last = out[out.length - 1];
    if (ch in VOWEL && last) { last.vowel = VOWEL[ch]; continue; }
    if (ch in TANWEEN && last) { last.tanween = TANWEEN[ch]; continue; }
    if (ch === SHADDA && last) { last.shadda = true; continue; }
    if ((ch === SUKUN || ch === SMALL_SUKUN) && last) { last.sukun = true; continue; }
    if (ch === DAGGER_ALIF && last) { last.dagger = true; continue; }
    if ((ch === SMALL_ZERO || ch === SMALL_RECT_ZERO) && last) { last.silent = true; continue; }
    if (ch === SMALL_WAW && last) { last.smallWaw = true; continue; }
    if ((ch === SMALL_YA || ch === SMALL_HIGH_YA) && last) { last.smallYa = true; continue; }
    if ((ch === SMALL_HIGH_MEEM || ch === SMALL_LOW_MEEM) && last) { last.meem = true; continue; }
    if ((ch === HAMZA_ABOVE || ch === HAMZA_BELOW) && last) { last.hamza = true; continue; }
    if (ch === SMALL_HIGH_NOON) { out.push(blank(NUN)); continue; }
    if (/\p{M}/u.test(ch)) continue;
    out.push(blank(ch));
  }
  return out;
}

export interface WordSound {
  /** The word read on its own */
  alone: string;
  /** Read straight after another word: a starting connecting alif's vowel gone */
  joined: string;
  /** Starts with the connecting alif (joins onto the word before) */
  wasl: boolean;
  /** Its first letter has a shadda (a nūn or tanwīn before it merges in) */
  firstDoubled: string | null;
  /** Ends in a nūn sound: sukūn nūn or tanwīn */
  endsInNoon: boolean;
  /** Ends on a consonant (a connecting alif after it needs a helping vowel) */
  endsClosed: boolean;
  /** Pausal forms, for the last word of an ayah */
  pausal: string;
  pausalJoined: string;
}

/** Long vowels: aa, ee, oo */
const LONG = { a: 'aa', i: 'ee', u: 'oo' } as const;
const lengthen = (s: string, v: 'a' | 'i' | 'u') => (s.endsWith(v) && !s.endsWith(LONG[v]) ? s.slice(0, -1) + LONG[v] : s.endsWith(LONG[v]) ? s : s + LONG[v]);
const lengthenEnd = (s: string) => s.replace(/a$/, 'aa').replace(/i$/, 'ee').replace(/u$/, 'oo');

/** The sound of one Uthmani word, in the forms the ayah reading needs */
export function wordSound(word: string): WordSound {
  const L = letters(word);
  const bare = L.map((l) => l.ch).join('');
  if (MUQATTAAT[bare] && (word.includes(MADDA) || bare === 'طه') && !L.some((l) => l.vowel)) {
    const name = MUQATTAAT[bare];
    return { alone: name, joined: name, wasl: false, firstDoubled: null, endsInNoon: false, endsClosed: false, pausal: name, pausalJoined: name };
  }

  // parts[k] is what letter k says; a long vowel or silent letter extends the one before
  const parts: string[] = [];
  let joinFrom = 0; // where the joined form starts (after a dropped starting vowel)
  let wasl = false;
  let endsInNoon = false, endsClosed = false;
  const push = (s: string) => parts.push(s);
  const extend = (f: (s: string) => string) => { if (parts.length) parts[parts.length - 1] = f(parts[parts.length - 1]); else parts.push(f('')); };

  for (let i = 0; i < L.length; i++) {
    const l = L[i], prev = L[i - 1], next = L[i + 1];
    if (l.silent) continue;

    // The connecting alif: says a/i/u only when the word starts on it
    if (l.ch === ALIF_WASLA) {
      const atStart = i === 0;
      if (atStart) wasl = true;
      // One lam carrying the shadda is the article merged into a lam (ٱلَّذِينَ, ٱلَّيْلِ)
      if (next?.ch === LAM && next.shadda && next.vowel) {
        if (atStart) { push('a'); joinFrom = 1; }
        push('l-');
        L[i + 1] = { ...next, shadda: false };
        continue;
      }
      if (next?.ch === LAM && L[i + 2]) {
        const third = L[i + 2];
        // The name of Allah: ٱللَّه (also after a prefix: وَٱللَّهُ, بِٱللَّهِ)
        const isAllah = third.ch === LAM && third.shadda && L[i + 3]?.ch === HA;
        const sun = !isAllah && !next.sukun && !next.vowel && third.shadda && third.ch in CONSONANT;
        if (atStart) push('a');
        joinFrom = atStart ? 1 : joinFrom;
        if (isAllah) {
          // Written as one word: allaahu alone, bismillaahi joined
          push('llaah' + (L[i + 3].vowel ?? '') + (L[i + 3].tanween ? L[i + 3].tanween + 'n' : ''));
          i += 3;
        } else if (sun) {
          const s = CONSONANT[third.ch];
          push(`${s}-`);
          L[i + 2] = { ...third, shadda: false };
          i += 1;
        } else {
          push('l-');
          i += 1;
          // A hamza straight after the article needs no apostrophe (al-ardi)
          if (L[i + 1] && HAMZAS.has(L[i + 1].ch)) L[i + 1] = { ...L[i + 1], ch: 'x' };
        }
      } else if (atStart) {
        // A verb or noun's connecting alif: i, or u when the third letter has a damma
        push(L[i + 2]?.vowel === 'u' ? 'u' : 'i');
        joinFrom = 1;
      }
      continue;
    }

    // Alif: lengthens a fatha, sits after fathatan, or is silent
    if (l.ch === ALIF) {
      if (l.hamza) { push((i === 0 ? '' : "'") + (l.vowel ?? '')); continue; }
      if (prev?.tanween) continue;
      if (prev?.ch === WAW && !prev.vowel && !prev.shadda && !prev.sukun) continue; // the plural's alif: كَفَرُوا
      if (prev?.vowel === 'a' || prev?.dagger) { extend((s) => s.endsWith('aa') ? s : s + 'a'); continue; }
      if (l.vowel) { push(l.vowel); continue; }
      continue;
    }
    if (l.ch === ALIF_MADDA) { push((i === 0 ? '' : "'") + 'aa'); continue; }
    // Alif maqsura: a long a (or long i after a kasra) unless it's voiced as y
    if (l.ch === ALIF_MAQSURA && !l.vowel && !l.shadda && !l.sukun && !l.tanween) {
      if (prev?.vowel === 'i') extend((s) => lengthen(s, 'i'));
      else if (l.dagger || prev?.vowel === 'a') extend((s) => s.endsWith('aa') ? s : lengthenEnd(s.replace(/a$/, 'a')));
      continue;
    }
    // Waw and ya as long vowels after a matching short vowel
    if (l.ch === WAW && !l.vowel && !l.shadda && !l.sukun && !l.tanween && !l.dagger && prev?.vowel === 'u') { extend((s) => lengthen(s, 'u')); continue; }
    if (l.ch === YA && !l.vowel && !l.shadda && !l.sukun && !l.tanween && prev?.vowel === 'i') { extend((s) => lengthen(s, 'i')); continue; }
    // Waw carrying the superscript alif (ٱلصَّلَوٰةَ) is a long a
    if (l.ch === WAW && l.dagger && !l.vowel) { extend((s) => (s.endsWith('a') ? s + 'a' : s + 'aa')); continue; }

    // An unvowelled lām before a doubled sun letter is the article's, and silent (لِلنَّاسِ)
    if (l.ch === LAM && !l.vowel && !l.sukun && !l.shadda && next?.shadda && i > 0) continue;
    let cons = l.ch === 'x' ? '' : CONSONANT[l.ch];
    if (cons == null) continue;
    if (i === 0 && HAMZAS.has(l.ch)) cons = ''; // a word-initial hamza is just its vowel
    if (l.ch === TA_MARBUTA && !l.vowel && !l.tanween) cons = 'h';
    if (l.ch === NUN && l.meem && !l.vowel && next?.ch === BA) cons = 'm';
    let s = l.shadda && i > 0 ? cons + cons : cons;
    // The name of Allah after a prefixed lām (لِلَّهِ): the a is long though unwritten
    const allah = l.ch === LAM && l.shadda && l.vowel === 'a' && prev?.ch === LAM && next?.ch === HA
      && (i + 2 === L.length || (L[i + 2]?.ch === MIM && i + 3 >= L.length));
    if (l.vowel) {
      s += l.vowel;
      if (l.dagger || allah) s = lengthen(s, 'a');
      if (l.smallWaw && l.vowel === 'u') s = lengthen(s, 'u');
      if (l.smallYa && l.vowel === 'i') s = lengthen(s, 'i');
    } else if (l.dagger) {
      s += 'aa';
    }
    if (l.tanween) s += l.tanween + 'n';
    // A consonant then h would read as a digraph (sh, th, kh, dh, gh): keep them apart
    if (/^h/.test(s) && parts.length && /[stkdgz]$/.test(parts[parts.length - 1])) s = "'" + s;
    push(s);
    const rest = L.slice(i + 1);
    if (rest.every((x) => x.silent || x.ch === ALIF || (x.ch === ALIF_MAQSURA && !x.vowel && !x.shadda))) {
      endsInNoon = !!l.tanween || (l.ch === NUN && !l.vowel);
      endsClosed = !l.vowel && !l.dagger;
      if (l.tanween) endsClosed = true;
    }
  }

  const alone = parts.join('').replace(/-+$/, '').replace(/^-/, '');
  const joined = parts.slice(joinFrom).join('').replace(/-+$/, '');
  const firstDoubled = !wasl && L[0]?.shadda ? CONSONANT[L[0].ch] ?? null : null;
  const lastLetter = [...L].reverse().find((l) => !l.silent && l.ch !== ALIF && !(l.ch === ALIF_MAQSURA && !l.vowel && !l.shadda));
  return {
    alone, joined, wasl, firstDoubled, endsInNoon, endsClosed,
    pausal: pausalOf(alone, lastLetter), pausalJoined: pausalOf(joined, lastLetter),
  };
}

/** A word as said when stopping on it: no final short vowel or tanwīn (fathatan → aa) */
function pausalOf(text: string, last: Letter | undefined): string {
  if (!last) return text;
  if (last.ch === TA_MARBUTA) return text.replace(/t(an|un|in|a|u|i)$/, 'h');
  if (last.tanween === 'a') return text.replace(/an$/, 'aa');
  if (last.tanween) return text.replace(/(un|in)$/, '');
  // The pronoun's lengthening (ۥ ۦ) isn't said when stopping: خَلَقَهُۥ → khalaqah
  if (last.smallWaw || last.smallYa) return text.replace(/(oo|ee)$/, '');
  if (last.vowel && !last.dagger) return text.replace(/([^aeiou'])[aiu]$/, '$1');
  return text;
}

/** A word read on its own */
export function transliterateWord(word: string): string {
  return wordSound(word).alone;
}

/** A whole ayah, read as it's recited: joined across words, stopping at the end */
export function transliterateAyah(words: string[]): string {
  const sounds = words.map(wordSound);
  const out: string[] = [];
  sounds.forEach((w, i) => {
    const last = i === sounds.length - 1;
    const text = last ? w.pausal : w.alone;
    if (i === 0) { out.push(text); return; }
    const prev = sounds[i - 1];
    let before = out[out.length - 1];
    if (w.wasl) {
      // The connecting alif drops: a long vowel before it shortens, a closed word
      // takes a helping vowel (u after the plural -hum, -kum, -tum; otherwise i)
      if (prev.endsClosed) before += /(hum|kum|tum)$/.test(before) ? 'u' : 'i';
      else before = before.replace(/(aa|ee|oo)$/, (v) => v[0] === 'e' ? 'i' : v[0] === 'o' ? 'u' : 'a');
      out[out.length - 1] = before + (last ? w.pausalJoined : w.joined);
      return;
    }
    if (prev.endsInNoon && w.firstDoubled) {
      // Idghām: the n merges into the doubled letter that follows
      out[out.length - 1] = before.replace(/n$/, w.firstDoubled.charAt(0));
    } else if (prev.endsInNoon && text.startsWith('b')) {
      // Iqlāb: n before b turns to m
      out[out.length - 1] = before.replace(/n$/, 'm');
    }
    out.push(text);
  });
  const line = out.join(' ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}
