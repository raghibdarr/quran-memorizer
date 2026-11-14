// Pure helpers for the /sources page: pulling the "not included, and why"
// section out of a deck's SELECTION.md, and the entries out of ERRATA.md.

/**
 * The body of a SELECTION.md's "Not included" section (any heading level whose
 * text contains "not included"), up to the next heading of the same or a higher
 * level. Null when the file has no such section or it is empty.
 */
export function notIncludedSection(md: string): string | null {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^#{1,4}\s+.*not included/i.test(l));
  if (start === -1) return null;
  const level = lines[start].match(/^#+/)![0].length;
  const body: string[] = [];
  for (const l of lines.slice(start + 1)) {
    const h = l.match(/^(#+)\s/);
    if (h && h[1].length <= level) break;
    // Deeper headings become the "## " MiniMarkdown understands
    body.push(h ? `## ${l.replace(/^#+\s+/, '')}` : l);
  }
  const text = body.join('\n').trim();
  return text || null;
}

/** ERRATA.md without its title and the paragraph that explains the format */
export function errataBody(md: string): string | null {
  const blocks = md.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  const rest = blocks.filter((b, i) => !b.startsWith('# ') && !(i === 1 && /^Corrections to shipped/i.test(b)));
  const text = rest.join('\n\n').trim();
  if (!text || /^No corrections yet\.?$/i.test(text)) return null;
  return text;
}

/** The deck id a SELECTION.md belongs to, from its path under content/deen */
export function deckIdForSelection(relPath: string): string {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  parts.pop(); // SELECTION.md
  // adhkar/<deck>/SELECTION.md → <deck>; nawawi40/SELECTION.md → nawawi40; course/<unit> → course-<unit>
  if (parts[0] === 'course' && parts[1]) return `course-${parts[1]}`;
  return parts[parts.length - 1] ?? '';
}
