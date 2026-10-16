import { Fragment, type ReactNode } from 'react';
import Link from '@/components/app-link';

/**
 * Just enough markdown for the guides (src/content/guides.ts): "## " headings, paragraphs,
 * "- " lists, **bold** and [text](href) links. Builds React elements, never HTML strings.
 */
export function MiniMarkdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines[0]?.startsWith('## ')) {
          return <h2 key={i} className="mt-8 text-lg font-bold text-foreground">{inline(lines[0].slice(3))}</h2>;
        }
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="mt-4 list-disc space-y-2 pl-5 marker:text-gold">
              {lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}
            </ul>
          );
        }
        return <p key={i} className="mt-4">{inline(lines.join(' '))}</p>;
      })}
    </>
  );
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let at = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(<Fragment key={k++}>{text.slice(at, m.index)}</Fragment>);
    if (m[1]) out.push(<strong key={k++} className="font-semibold text-foreground">{m[1]}</strong>);
    else out.push(
      m[3].startsWith('/')
        ? <Link key={k++} href={m[3]} className="font-medium text-teal underline underline-offset-2">{m[2]}</Link>
        : <a key={k++} href={m[3]} target="_blank" rel="noopener noreferrer" className="font-medium text-teal underline underline-offset-2">{m[2]}</a>,
    );
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(<Fragment key={k++}>{text.slice(at)}</Fragment>);
  return out;
}
