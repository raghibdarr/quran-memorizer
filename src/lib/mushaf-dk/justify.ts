// Line justification for the 1441H Madina mushaf, ported from DigitalKhatt's
// just.service.ts (github.com/DigitalKhatt/digitalkhatt-js, MIT, © DigitalKhatt
// contributors / Amine Anane). Only the New Madina path is kept, and the layout
// cache in localStorage is dropped; the rules themselves are unchanged.
//
// How it works: the line is shaped at its natural width; spaces take up to one
// extra space width (two after an ayah marker); then letters are widened by
// OpenType alternates the font carries — cv01 N picks the N-th, wider, form of a
// letter (kashida on the left side), cv02 N the matching right side, cv03 the kaf
// stretch, cv10–cv18 the decompositions some pairs need — in a fixed order of
// priority, a word at a time, while the line still fits. Whatever is left goes to
// the spaces; a line too long is squeezed horizontally (xScale). All of this is
// stock OpenType (alternate substitution with a feature value), so it shapes with
// stock HarfBuzz; no fork is needed.

import type { HBFeature, HBFont } from './harfbuzz';

/** Font size in font units (the font's em is 1000) */
export const FONTSIZE = 1000;

export const enum SpaceType {
  Simple = 1,
  Aya,
}

const enum AppliedResult {
  NoChange,
  Positive,
  Overflow,
  Forbiden,
}

export interface SubWordInfo { baseIndexes: number[]; baseText: string }
export interface WordInfo {
  startIndex: number;
  endIndex: number;
  text: string;
  baseText: string;
  baseIndexes: number[];
  subwords: SubWordInfo[];
}
export interface LineTextInfo {
  lineText: string;
  ayaSpaceIndexes: number[];
  simpleSpaceIndexes: number[];
  spaces: Map<number, SpaceType>;
  wordInfos: WordInfo[];
  features: HBFeature[] | null;
}
export interface TextFontFeatures { name: string; value: number }

interface LayoutResult {
  parWidth: number;
  appliedKashidas: Map<StretchType, [subWordIndex: number, characterIndexInSubWord: number]>;
}
interface JustInfo {
  fontFeatures: Map<number, TextFontFeatures[]>;
  desiredWidth: number;
  textLineWidth: number;
  layoutResults: LayoutResult[];
  font: HBFont;
}
export interface JustResultByLine {
  globalFeatures?: TextFontFeatures[];
  /** Features by character index in the line */
  fontFeatures: Map<number, TextFontFeatures[]>;
  simpleSpacing: number;
  ayaSpacing: number;
  xScale: number;
}
interface AppliedFeature {
  feature: TextFontFeatures;
  calcNewValue?: (prev: number | undefined, curr: number) => number;
}
interface SubWordsMatch { subWordIndexes: number[]; matches: RegExpMatchArray[][] }

const enum StretchType {
  None = 0,
  Beh = 1,
  FinaAscendant = 2,
  OtherKashidas = 3,
  Kaf = 4,
  SecondKashidaNotSameSubWord = 5,
  SecondKashidaSameSubWord = 6,
}

const rightNoJoinLetters = 'آاٱأإدذرزوؤءة';
const dualJoinLetters = 'بتثجحخسشصضطظعغفقكلمنهيئى';
const finalAscendant = 'آادذٱأإكلهة';

const bases = new Set<number>();
for (const s of [dualJoinLetters, rightNoJoinLetters]) for (let i = 0; i < s.length; i++) bases.add(s.charCodeAt(i));

function getWordWidth(wordInfo: WordInfo, justResults: Map<number, TextFontFeatures[]>, font: HBFont, pfeatures: HBFeature[] | null): number {
  const features: HBFeature[] = pfeatures ? [...pfeatures] : [];
  for (let i = wordInfo.startIndex; i <= wordInfo.endIndex; i++) {
    const justInfo = justResults.get(i);
    if (justInfo) {
      for (const feat of justInfo) {
        features.push({ tag: feat.name, value: feat.value, start: i - wordInfo.startIndex, end: i - wordInfo.startIndex + 1 });
      }
    }
  }
  return font.width(wordInfo.text, features);
}

function tryApplyFeatures(wordIndex: number, lineTextInfo: LineTextInfo, justInfo: JustInfo, newFeatures: Map<number, TextFontFeatures[]>): AppliedResult {
  const layout = justInfo.layoutResults[wordIndex];
  const wordInfo = lineTextInfo.wordInfos[wordIndex];
  const wordNewWidth = getWordWidth(wordInfo, newFeatures, justInfo.font, lineTextInfo.features);
  const diff = wordNewWidth - layout.parWidth;
  if (wordNewWidth !== layout.parWidth && justInfo.textLineWidth + diff < justInfo.desiredWidth) {
    justInfo.textLineWidth += diff;
    layout.parWidth = wordNewWidth;
    justInfo.fontFeatures = newFeatures;
    return AppliedResult.Positive;
  } else if (diff === 0) {
    return AppliedResult.NoChange;
  }
  return AppliedResult.Overflow;
}

function mergeFeatures(prevFeatures: TextFontFeatures[] | undefined, newFeatures: AppliedFeature[]): TextFontFeatures[] {
  const merged = prevFeatures ? prevFeatures.map((x) => ({ ...x })) : [];
  for (const nf of newFeatures) {
    const exist = merged.find((p) => p.name === nf.feature.name);
    if (exist) {
      exist.value = nf.calcNewValue ? nf.calcNewValue(exist.value, nf.feature.value) : nf.feature.value;
    } else {
      merged.push({ name: nf.feature.name, value: nf.calcNewValue ? nf.calcNewValue(undefined, nf.feature.value) : nf.feature.value });
    }
  }
  return merged;
}

function matchSubWords(wordInfo: WordInfo, regExprs: RegExp[]): SubWordsMatch {
  const result: SubWordsMatch = { subWordIndexes: [], matches: [] };
  for (let subIndex = 0; subIndex < wordInfo.subwords.length; subIndex++) {
    const subWord = wordInfo.subwords[subIndex];
    const subWordMatches: RegExpMatchArray[] = [];
    result.matches.push(subWordMatches);
    for (const re of regExprs) for (const m of subWord.baseText.matchAll(re)) subWordMatches.push(m);
    if (subWordMatches.length > 0) result.subWordIndexes.push(subIndex);
  }
  return result;
}

function applyExperimentalJust(l: LineTextInfo, j: JustInfo) {
  // Each step returns true once the line would overflow, which ends the chain
  return (
    applyKashidasSubWords(l, j, StretchType.Beh, 2) ||
    applyAlternatesSubWords(l, j, 'بتثكن', 2) ||
    applyKashidasSubWords(l, j, StretchType.FinaAscendant, 3) ||
    applyKashidasSubWords(l, j, StretchType.OtherKashidas, 2) ||
    applyAlternatesSubWords(l, j, 'ىصضسشفقيئ', 2) ||
    applyKashidasSubWords(l, j, StretchType.Kaf, 1) ||
    applyKashidasSubWords(l, j, StretchType.Beh, 1) ||
    applyAlternatesSubWords(l, j, 'بتثكن', 1) ||
    applyKashidasSubWords(l, j, StretchType.FinaAscendant, 1) ||
    applyKashidasSubWords(l, j, StretchType.OtherKashidas, 1) ||
    applyAlternatesSubWords(l, j, 'ىصضسشفقيئ', 1) ||
    applyAlternatesSubWords(l, j, 'بتثكن', 2) ||
    applyAlternatesSubWords(l, j, 'ىصضسشفقيئبتثكن', 2) ||
    applyKashidasSubWords(l, j, StretchType.Beh, 1) ||
    applyKashidasSubWords(l, j, StretchType.FinaAscendant, 1) ||
    applyKashidasSubWords(l, j, StretchType.OtherKashidas, 1) ||
    applyAlternatesSubWords(l, j, 'ىصضسشفقيئبتثكن', 2) ||
    applyKashidasSubWords(l, j, StretchType.SecondKashidaNotSameSubWord, 2) ||
    applyKashidasSubWords(l, j, StretchType.SecondKashidaSameSubWord, 2)
  );
}

function applyKashida(
  lineTextInfo: LineTextInfo,
  justInfo: JustInfo,
  wordIndex: number,
  subWordIndex: number,
  firstSubWordMatchIndex: number,
  secondSubWordMacthIndex: number,
): AppliedResult {
  const lineText = lineTextInfo.lineText;
  const wordInfo = lineTextInfo.wordInfos[wordIndex];
  const subWordInfo = wordInfo.subwords[subWordIndex];
  const firstMatchIndex = subWordInfo.baseIndexes[firstSubWordMatchIndex];
  const secondMatchIndex = subWordInfo.baseIndexes[secondSubWordMacthIndex];
  const firstIndexInLine = wordInfo.startIndex + firstMatchIndex;
  const secondIndexInLine = wordInfo.startIndex + secondMatchIndex;

  const tempResult = new Map(justInfo.fontFeatures);
  const firstPrevFeatures = tempResult.get(firstIndexInLine);
  const secondPrevFeatures = tempResult.get(secondIndexInLine);

  if (secondPrevFeatures?.find((a) => a.name === 'cv01')) return AppliedResult.Forbiden;

  const chark3 = lineText[firstIndexInLine];
  const chark4 = lineText[secondIndexInLine];

  if (chark4 === 'ق' && subWordInfo.baseIndexes.at(-1) === secondMatchIndex) {
    return AppliedResult.Forbiden;
  } else if (chark3 === 'ل' && (chark4 === 'ك' || chark4 === 'د' || chark4 === 'ذ' || chark4 === 'ة' || (chark4 === 'ه' && subWordInfo.baseIndexes.at(-1) === secondMatchIndex))) {
    return AppliedResult.Forbiden;
  } else if ('ئبتثنيى'.includes(chark3) && subWordInfo.baseIndexes[0] !== firstMatchIndex && 'رز'.includes(chark4)) {
    return AppliedResult.Forbiden;
  }

  const secondNewFeatures: TextFontFeatures[] = [];
  let cv01Value = 0;
  const firstAppliedFeatures: AppliedFeature[] = [{
    feature: { name: 'cv01', value: 1 },
    calcNewValue: (prev, curr) => {
      cv01Value = Math.min((prev || 0) + curr, 6);
      return cv01Value;
    },
  }];

  if ('بتثنيئ'.includes(chark3)) firstAppliedFeatures.push({ feature: { name: 'cv10', value: 1 } });

  const finalSubWordMatch = subWordInfo.baseIndexes.at(-1) === secondMatchIndex;
  const pair = (tag: string) => {
    firstAppliedFeatures.push({ feature: { name: tag, value: 1 } });
    secondNewFeatures.push({ name: tag, value: 1 });
  };

  // decomposition
  if ('ه'.includes(chark3) && 'م'.includes(chark4) && finalSubWordMatch) pair('cv11');
  else if ('بتثنيئ'.includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && 'جحخ'.includes(chark4)) pair('cv12');
  else if ('م'.includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && 'جحخ'.includes(chark4)) pair('cv13');
  else if ('فق'.includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && 'جحخ'.includes(chark4)) pair('cv14');
  else if ('ل'.includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && 'جحخ'.includes(chark4)) pair('cv15');
  else if ('عغ'.includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && ('آادذٱأإل'.includes(chark4) || ('بتثنيئ'.includes(chark4) && 'سش'.includes(subWordInfo.baseText?.[2] ?? '\0')))) pair('cv16');
  else if ('جحخ'.includes(chark3)) {
    if (
      'آادذٱأإل'.includes(chark4) ||
      ('هة'.includes(chark4) && finalSubWordMatch) ||
      ('بتثنيئ'.includes(chark4) && subWordInfo.baseIndexes.at(-2) === secondMatchIndex && 'رزن'.includes(subWordInfo.baseText.at(-1)!))
    ) pair('cv16');
    else if (subWordInfo.baseIndexes[0] === firstMatchIndex && 'م'.includes(chark4)) pair('cv18');
  } else if ('سشصض'.includes(chark3) && 'رز'.includes(chark4)) pair('cv17');

  const firstNewFeatures = mergeFeatures(firstPrevFeatures, firstAppliedFeatures);
  const cv02Value = finalAscendant.includes(chark4) && finalSubWordMatch ? cv01Value : 2 * cv01Value;
  secondNewFeatures.push({ name: 'cv02', value: cv02Value });

  tempResult.set(firstIndexInLine, firstNewFeatures);
  tempResult.set(secondIndexInLine, secondNewFeatures);
  return tryApplyFeatures(wordIndex, lineTextInfo, justInfo, tempResult);
}

function fathaAfter(lineText: string, index: number): number | undefined {
  if (lineText[index + 1] === 'َ') return index + 1;
  if (lineText[index + 1] === 'ّ' && lineText[index + 2] === 'َ') return index + 2;
  return undefined;
}

function applyKaf(
  lineTextInfo: LineTextInfo,
  justInfo: JustInfo,
  wordIndex: number,
  subWordIndex: number,
  firstSubWordMatchIndex: number,
  secondSubWordMacthIndex: number,
): AppliedResult {
  const wordInfo = lineTextInfo.wordInfos[wordIndex];
  const subWordInfo = wordInfo.subwords[subWordIndex];
  const firstIndexInLine = wordInfo.startIndex + subWordInfo.baseIndexes[firstSubWordMatchIndex];
  const secondIndexInLine = wordInfo.startIndex + subWordInfo.baseIndexes[secondSubWordMacthIndex];

  const tempResult = new Map(justInfo.fontFeatures);
  const firstPrevFeatures = tempResult.get(firstIndexInLine);
  const secondPrevFeatures = tempResult.get(secondIndexInLine);
  tempResult.set(firstIndexInLine, mergeFeatures(firstPrevFeatures, [{ feature: { name: 'cv03', value: 1 }, calcNewValue: () => 1 }]));
  const secondNew = mergeFeatures(secondPrevFeatures, [{ feature: { name: 'cv03', value: 1 }, calcNewValue: () => 1 }]);
  tempResult.set(secondIndexInLine, secondNew);

  const fathaIndex = fathaAfter(lineTextInfo.lineText, firstIndexInLine);
  if (fathaIndex !== undefined) {
    const cv01Value = secondNew.find((a) => a.name === 'cv01')?.value || 0;
    tempResult.set(fathaIndex, [{ name: 'cv01', value: 1 + Math.floor(cv01Value / 3) }]);
  }
  return tryApplyFeatures(wordIndex, lineTextInfo, justInfo, tempResult);
}

const kashRight = 'بتثنيئ' + 'جحخ' + 'سش' + 'صض' + 'طظ' + 'عغ' + 'فق' + 'م' + 'ه';
const kashLeft = 'ئبتثني' + 'جحخ' + 'طظ' + 'عغ' + 'فق' + 'ةلم' + 'رز';
const mediLeftAsendant = 'ل';
const behRe = () => new RegExp(`^.+(?<k1>[بتثنيسشصض][بتثنيم]).+$`, 'gdu');
const regexCache = new Map<StretchType, RegExp[]>();
function stretchRegexps(type: StretchType): RegExp[] {
  let r = regexCache.get(type);
  if (r) return r;
  const leftNoReh = kashLeft.replace('رز', '');
  switch (type) {
    case StretchType.Beh: r = [behRe()]; break;
    case StretchType.FinaAscendant: r = [new RegExp(`^.*(?<k1>[${kashRight}][آادذٱأإكلهة])$`, 'gdu')]; break;
    case StretchType.OtherKashidas:
      r = [new RegExp(`.*(?<k1>[${kashRight}][رز])`, 'gdu'), new RegExp(`.*(?<k1>[${kashRight}](?:[${mediLeftAsendant}]|[${leftNoReh}]))`, 'gdu')];
      break;
    case StretchType.Kaf: r = [new RegExp(`^.*(?<k1>[ك].).*$`, 'gdu')]; break;
    case StretchType.SecondKashidaNotSameSubWord:
      r = [
        behRe(),
        new RegExp(`^.*(?<k1>[${kashRight}][آادذٱأإكلهة])$`, 'gdu'),
        new RegExp(`.*(?<k1>[${kashRight}][رز])`, 'gdu'),
        new RegExp(`.*(?<k1>[${kashRight}](?:[${mediLeftAsendant}]|[${leftNoReh}]))`, 'gdu'),
      ];
      break;
    case StretchType.SecondKashidaSameSubWord:
      r = [
        behRe(),
        new RegExp(`(?<k1>[${kashRight}][آادذٱأإكلهة])$`, 'gdu'),
        new RegExp(`(?<k1>[${kashRight}][رز])`, 'gdu'),
        new RegExp(`(?<k1>[${kashRight}](?:[${mediLeftAsendant}]|[${leftNoReh}]))`, 'gdu'),
      ];
      break;
    default: r = [];
  }
  regexCache.set(type, r);
  return r;
}

function applyKashidasSubWords(lineTextInfo: LineTextInfo, justInfo: JustInfo, type: StretchType, nbLevels: number): boolean {
  const wordInfos = lineTextInfo.wordInfos;
  const regExprs = stretchRegexps(type);
  const matchresult = wordInfos.map((w) => matchSubWords(w, regExprs));

  for (let level = 1; level <= nbLevels; level++) {
    for (let wordIndex = 0; wordIndex < wordInfos.length; wordIndex++) {
      const subWordsMatch = matchresult[wordIndex];
      const wordLayout = justInfo.layoutResults[wordIndex];
      const type1Applied = wordLayout.appliedKashidas.get(StretchType.Beh);
      const type2Applied = wordLayout.appliedKashidas.get(StretchType.FinaAscendant);
      const type3Applied = wordLayout.appliedKashidas.get(StretchType.OtherKashidas);
      const type5Applied = wordLayout.appliedKashidas.get(StretchType.SecondKashidaNotSameSubWord);

      if (type === StretchType.Beh && (type2Applied || type3Applied)) continue;
      if (type === StretchType.FinaAscendant && (type1Applied || type3Applied)) continue;
      if (type === StretchType.OtherKashidas && (type1Applied || type2Applied)) continue;

      let done = false;
      for (let i = subWordsMatch.subWordIndexes.length - 1; i >= 0 && !done; i--) {
        const subWordIndex = subWordsMatch.subWordIndexes[i];
        for (const match of subWordsMatch.matches[subWordIndex]) {
          const kashidaGroup = match?.indices?.[1];
          if (!kashidaGroup) continue;
          const firstSubWordMatchIndex = kashidaGroup[0];
          const secondSubWordMacthIndex = firstSubWordMatchIndex + 1;

          if (type === StretchType.SecondKashidaNotSameSubWord) {
            const type123 = type1Applied || type2Applied || type3Applied;
            if (type123 && type123[0] === subWordIndex) continue;
          } else if (type === StretchType.SecondKashidaSameSubWord) {
            const type123 = type1Applied || type2Applied || type3Applied;
            if (type123 && type123[0] === subWordIndex && type123[1] === firstSubWordMatchIndex) continue;
            if (type5Applied && type5Applied[0] === subWordIndex && type5Applied[1] === firstSubWordMatchIndex) continue;
          }

          const appliedResult = type === StretchType.Kaf
            ? applyKaf(lineTextInfo, justInfo, wordIndex, subWordIndex, firstSubWordMatchIndex, secondSubWordMacthIndex)
            : applyKashida(lineTextInfo, justInfo, wordIndex, subWordIndex, firstSubWordMatchIndex, secondSubWordMacthIndex);

          if (appliedResult === AppliedResult.Positive) {
            wordLayout.appliedKashidas.set(type, [subWordIndex, firstSubWordMatchIndex]);
          } else if (appliedResult === AppliedResult.Overflow) {
            return true;
          } else if (appliedResult === AppliedResult.Forbiden) {
            continue;
          }
          done = true;
          break;
        }
      }
    }
  }
  return false;
}

function applyAlternate(lineTextInfo: LineTextInfo, justInfo: JustInfo, wordIndex: number, indexInLine: number): AppliedResult {
  const tempResult = new Map(justInfo.fontFeatures);
  const prevFeatures = tempResult.get(indexInLine);
  if ((prevFeatures?.find((a) => a.name === 'cv02')?.value || 0) > 0) return AppliedResult.Forbiden;

  const newFeatures = mergeFeatures(prevFeatures, [{ feature: { name: 'cv01', value: 1 }, calcNewValue: (prev, curr) => Math.min((prev || 0) + curr, 12) }]);
  tempResult.set(indexInLine, newFeatures);
  const fathaIndex = fathaAfter(lineTextInfo.lineText, indexInLine);
  if (fathaIndex !== undefined) {
    const v = newFeatures.find((a) => a.name === 'cv01')?.value || 0;
    tempResult.set(fathaIndex, [{ name: 'cv01', value: 1 + Math.floor(v / 3) }]);
  }
  return tryApplyFeatures(wordIndex, lineTextInfo, justInfo, tempResult);
}

const altRegexCache = new Map<string, RegExp[]>();
function applyAlternatesSubWords(lineTextInfo: LineTextInfo, justInfo: JustInfo, chars: string, nbLevels: number): boolean {
  const wordInfos = lineTextInfo.wordInfos;
  let re = altRegexCache.get(chars);
  if (!re) altRegexCache.set(chars, (re = [new RegExp(`^.*(?<alt>[${chars}])$`, 'gdu')]));
  const matchresult = wordInfos.map((w) => matchSubWords(w, re));

  for (let level = 1; level <= nbLevels; level++) {
    for (let wordIndex = 0; wordIndex < wordInfos.length; wordIndex++) {
      const wordInfo = wordInfos[wordIndex];
      const subWordsMatch = matchresult[wordIndex];
      for (let i = subWordsMatch.subWordIndexes.length - 1; i >= 0; i--) {
        const subWordIndex = subWordsMatch.subWordIndexes[i];
        const alt = subWordsMatch.matches[subWordIndex][0]?.indices?.[1];
        if (!alt) continue;
        const indexInLine = wordInfo.startIndex + wordInfo.subwords[subWordIndex].baseIndexes[alt[0]];
        const appliedResult = applyAlternate(lineTextInfo, justInfo, wordIndex, indexInLine);
        if (appliedResult === AppliedResult.Overflow) return true;
        else if (appliedResult === AppliedResult.Forbiden) continue;
        else break;
      }
    }
  }
  return false;
}

/**
 * Justify one line to `desiredWidth` font units. `spaceWidth` is the font's
 * space advance. Returns the per-character features and the two space widths.
 */
export function justifyLine(lineTextInfo: LineTextInfo, font: HBFont, desiredWidth: number, spaceWidth: number, opts: { tighten?: boolean } = {}): JustResultByLine {
  const layoutResults: LayoutResult[] = lineTextInfo.wordInfos.map((w) => ({
    parWidth: font.width(w.text, lineTextInfo.features),
    appliedKashidas: new Map(),
  }));
  let currentLineWidth = font.width(lineTextInfo.lineText, lineTextInfo.features);

  let xScale = 1;
  let simpleSpacing = spaceWidth;
  let ayaSpacing = spaceWidth;
  let fontFeatures = new Map<number, TextFontFeatures[]>();

  if (desiredWidth - currentLineWidth > 0) {
    const maxStretchBySpace = Math.min(100, spaceWidth * 1);
    const maxStretchByAyaSpace = Math.min(200, spaceWidth * 2);
    const maxStretch = maxStretchBySpace * lineTextInfo.simpleSpaceIndexes.length + maxStretchByAyaSpace * lineTextInfo.ayaSpaceIndexes.length;
    const stretch = Math.min(desiredWidth - currentLineWidth, maxStretch);
    const spaceRatio = maxStretch !== 0 ? stretch / maxStretch : 0;
    let simpleSpaceWidth = spaceWidth + spaceRatio * maxStretchBySpace;
    let ayaSpaceWidth = spaceWidth + spaceRatio * maxStretchByAyaSpace;
    currentLineWidth += stretch;

    if (desiredWidth > currentLineWidth) {
      const justInfo: JustInfo = { textLineWidth: currentLineWidth, fontFeatures: new Map(), layoutResults, desiredWidth, font };
      applyExperimentalJust(lineTextInfo, justInfo);
      currentLineWidth = justInfo.textLineWidth;
      fontFeatures = justInfo.fontFeatures;
    }
    if (desiredWidth > currentLineWidth && lineTextInfo.spaces.size > 0) {
      // full justify with space
      const addToSpace = (desiredWidth - currentLineWidth) / lineTextInfo.spaces.size;
      simpleSpaceWidth += addToSpace;
      ayaSpaceWidth += addToSpace;
    }
    simpleSpacing = simpleSpaceWidth;
    ayaSpacing = ayaSpaceWidth;
  } else if (opts.tighten && lineTextInfo.simpleSpaceIndexes.length > 0) {
    // Takrar addition: the print packs dense lines tighter than this font's
    // natural forms. Close up the plain spaces first, down to SPACE_FLOOR of a
    // space (the spaces either side of an ayah marker stay as they are), and
    // squeeze only what is still over. (The font's shr1/shr2/shrr features were
    // tried too: they swap in contracted letter forms that read differently from
    // the print, e.g. قالوا losing its alef, so they are not used.)
    const n = lineTextInfo.simpleSpaceIndexes.length;
    const over = currentLineWidth - desiredWidth;
    const gain = Math.min(over, n * spaceWidth * (1 - SPACE_FLOOR));
    simpleSpacing = spaceWidth - gain / n;
    if (over > gain) xScale = desiredWidth / (desiredWidth + over - gain);
  } else {
    // shrink
    xScale = desiredWidth / currentLineWidth;
  }
  return { fontFeatures, simpleSpacing, ayaSpacing, xScale };
}

/** Spaces on a dense line may close up to this fraction of a normal space */
export const SPACE_FLOOR = 0.25;

/** Split a line into words, sub-words (letters joined together) and its spaces */
export function analyzeLine(lineText: string, features: HBFeature[] | null = null): LineTextInfo {
  const info: LineTextInfo = { lineText, ayaSpaceIndexes: [], simpleSpaceIndexes: [], wordInfos: [], spaces: new Map(), features };
  const newWord = (start: number): WordInfo => ({ text: '', startIndex: start, endIndex: start - 1, baseText: '', baseIndexes: [], subwords: [{ baseText: '', baseIndexes: [] }] });
  let word = newWord(0);
  info.wordInfos.push(word);
  for (let i = 0; i < lineText.length; i++) {
    const char = lineText.charAt(i);
    if (char === ' ') {
      const prev = lineText.charCodeAt(i - 1);
      if ((prev >= 0x0660 && prev <= 0x0669) || lineText.charCodeAt(i + 1) === 0x06dd) {
        info.ayaSpaceIndexes.push(i);
        info.spaces.set(i, SpaceType.Aya);
      } else {
        info.simpleSpaceIndexes.push(i);
        info.spaces.set(i, SpaceType.Simple);
      }
      word = newWord(i + 1);
      info.wordInfos.push(word);
    } else {
      word.text += char;
      if (bases.has(char.charCodeAt(0))) {
        word.baseText += char;
        word.baseIndexes.push(i - word.startIndex);
        let isHamza = false;
        if (char === 'ء') {
          word.subwords.push({ baseText: '', baseIndexes: [] });
          isHamza = true;
        }
        const sub = word.subwords.at(-1)!;
        sub.baseText += char;
        sub.baseIndexes.push(i - word.startIndex);
        if (i < lineText.length - 1 && rightNoJoinLetters.includes(char) && !isHamza) word.subwords.push({ baseText: '', baseIndexes: [] });
      }
      word.endIndex++;
    }
  }
  return info;
}
