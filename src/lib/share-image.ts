'use client';

// Share an ayah as an image (roadmap #16): a square card with the Arabic, the
// translation and its source, and the reference, drawn on a canvas in the app's own
// fonts, then handed to the system share sheet (or downloaded where there's none).

import { Capacitor } from '@capacitor/core';

const SIZE = 1080;
const PAD = 96;

interface CardInput {
  arabic: string;
  translation: string;
  /** Shown in the card credit line */
  translationName?: string;
  reference: string; // "Al-Kahf 18:10"
  dark?: boolean;
}

/** The CSS font-family a class resolves to (next/font gives the faces generated names) */
function fontOf(className: string, fallback: string): string {
  const el = document.createElement('span');
  el.className = className;
  el.style.position = 'absolute';
  el.style.visibility = 'hidden';
  document.body.appendChild(el);
  const family = getComputedStyle(el).fontFamily || fallback;
  el.remove();
  return family;
}

/** Break text into lines that fit `width` at the context's current font */
export function wrap(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderAyahCard(input: CardInput): Promise<Blob> {
  const arabicFont = fontOf('arabic-text', 'serif');
  const latinFont = getComputedStyle(document.body).fontFamily || 'sans-serif';
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const bg = input.dark ? '#0f1a1d' : '#fefcf9';
  const ink = input.dark ? '#e9efe9' : '#1f2a2c';
  const muted = input.dark ? '#9db0b5' : '#5f6b6d';
  const gold = input.dark ? '#e0bc74' : '#8a6320';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, SIZE - 80, SIZE - 80);
  ctx.globalAlpha = 1;

  const width = SIZE - PAD * 2;
  // Arabic: shrink until it and the translation fit
  let arabicSize = 72;
  let translationSize = 34;
  let arabicLines: string[] = [];
  let translationLines: string[] = [];
  for (let i = 0; i < 12; i++) {
    ctx.font = `${arabicSize}px ${arabicFont}`;
    ctx.direction = 'rtl';
    arabicLines = wrap(ctx, input.arabic, width);
    ctx.direction = 'ltr';
    ctx.font = `${translationSize}px ${latinFont}`;
    translationLines = input.translation ? wrap(ctx, input.translation, width) : [];
    const height = arabicLines.length * arabicSize * 1.9 + translationLines.length * translationSize * 1.45 + 200;
    if (height <= SIZE - PAD * 2) break;
    arabicSize = Math.round(arabicSize * 0.9);
    translationSize = Math.max(22, Math.round(translationSize * 0.93));
  }
  const total = arabicLines.length * arabicSize * 1.9 + (translationLines.length ? 48 + translationLines.length * translationSize * 1.45 : 0);
  let y = (SIZE - total) / 2 - 30;

  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = `${arabicSize}px ${arabicFont}`;
  ctx.direction = 'rtl';
  for (const line of arabicLines) {
    y += arabicSize * 1.9;
    ctx.fillText(line, SIZE / 2, y - arabicSize * 0.45);
  }
  ctx.direction = 'ltr';
  if (translationLines.length) {
    y += 48;
    ctx.fillStyle = muted;
    ctx.font = `italic ${translationSize}px ${latinFont}`;
    for (const line of translationLines) {
      y += translationSize * 1.45;
      ctx.fillText(line, SIZE / 2, y);
    }
  }
  ctx.fillStyle = gold;
  ctx.font = `600 32px ${latinFont}`;
  ctx.fillText(input.reference, SIZE / 2, SIZE - 120);
  ctx.fillStyle = muted;
  ctx.font = `24px ${latinFont}`;
  ctx.fillText(input.translation ? `Translation: ${input.translationName ?? 'Saheeh International'} · Takrar` : 'Takrar', SIZE / 2, SIZE - 78);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

/** Share the card; returns how it went so the UI can say so */
export async function shareAyahCard(input: CardInput, fileName: string): Promise<ShareOutcome> {
  return shareImage(await renderAyahCard(input), fileName, input.reference);
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Hand an image to the system share sheet, or download it where there's none */
export async function shareImage(blob: Blob, fileName: string, title: string): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const data = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.readAsDataURL(blob);
    });
    const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    try {
      await Share.share({ files: [uri], title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}

/** Gilded fore-edge (roadmap V3): the mushaf seen from its edge, each page gilded by how well it's held */
export interface EdgeCardInput {
  /** 604 entries, page 1 first: 0 = not learned, otherwise 0–1 how well held */
  gilt: number[];
  held: number;
  strong: number;
  since: string | null;
  dark?: boolean;
}

export async function renderEdgeCard(input: EdgeCardInput): Promise<Blob> {
  const latinFont = getComputedStyle(document.body).fontFamily || 'sans-serif';
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const bg = input.dark ? '#0f1a1d' : '#fefcf9';
  const ink = input.dark ? '#e9efe9' : '#1f2a2c';
  const muted = input.dark ? '#9db0b5' : '#5f6b6d';
  const page = input.dark ? '#2a3a3e' : '#e9e2d4';
  const gold = '#c8963e';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // The book, edge-on: 604 page edges, page 1 at the right as an Arabic mushaf opens
  const x0 = PAD, w = SIZE - PAD * 2, top = 330, h = 300;
  ctx.fillStyle = page;
  ctx.fillRect(x0 - 8, top - 8, w + 16, h + 16);
  const step = w / input.gilt.length;
  input.gilt.forEach((g, i) => {
    if (!g) return;
    ctx.globalAlpha = 0.35 + 0.65 * g;
    ctx.fillStyle = gold;
    ctx.fillRect(x0 + w - (i + 1) * step, top, Math.max(1, step * 0.9), h);
  });
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = `700 64px ${latinFont}`;
  ctx.fillText(`${input.held} of 604 pages`, SIZE / 2, 200);
  ctx.fillStyle = muted;
  ctx.font = `32px ${latinFont}`;
  ctx.fillText(input.strong ? `held by heart, ${input.strong} of them strong` : 'held by heart', SIZE / 2, 254);
  if (input.since) ctx.fillText(`since ${input.since}`, SIZE / 2, 740);
  ctx.fillStyle = gold;
  ctx.font = `600 30px ${latinFont}`;
  ctx.fillText('Takrar', SIZE / 2, SIZE - 110);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}
