import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { MARK_LABELS, TASBIH_COPY, TRACKER_COPY } from './copy'

// The calm-wording rule (spec 1.6, 7): tracker and tasbih copy never scolds,
// never talks about a run ending, and says "missed" only as the plain option a
// user picks for a prayer.

const NEGATIVE = [
  /\bbr(?:eak|eaks|oke|oken)\b/i,
  /\bfail\w*/i,
  /\blos(?:e|es|t|ing)\b/i,
  /\bshame\w*/i,
  /\bguilt\w*/i,
  /\bbehind\b/i,
  /\boverdue\b/i,
  /\bow(?:e|es|ed|ing)\b/i,
  /\bdebt\w*/i,
  /\bbad\b/i,
  /\bwarning\b/i,
  /\bshould\b/i,
  /\bmust\b/i,
  /\bforg[eo]t\w*/i,
  /\bneglect\w*/i,
  /\blazy\b/i,
  /\bstreak\b/i,
  /\bonly\b/i,
  /\bwrong\b/i,
  /\boops\b/i,
  /!/,
]

/** "Missed" is allowed only as the option label itself */
const MISSED = /\bmiss(?:ed|ing|es)?\b/i

function strings(obj: Record<string, unknown>): string[] {
  return Object.values(obj).flatMap((v) => {
    if (typeof v === 'string') return [v]
    if (typeof v === 'function') return [String(v(3, 33)), String(v(1)), String(v('3 Nov'))]
    return []
  })
}

function check(text: string, where: string) {
  for (const re of NEGATIVE) expect(re.test(text), `${where}: "${text}" matches ${re}`).toBe(false)
  // The label itself, or quoted as the option a user picked, is fine
  const rest = text.trim() === MARK_LABELS.missed ? '' : text.split(`"${MARK_LABELS.missed}"`).join('')
  expect(MISSED.test(rest), `${where}: "${text}" says missed`).toBe(false)
}

describe('worship copy', () => {
  it('has no negative wording in the copy module', () => {
    for (const s of strings(TRACKER_COPY)) check(s, 'TRACKER_COPY')
    for (const s of strings(TASBIH_COPY)) check(s, 'TASBIH_COPY')
    for (const s of Object.values(MARK_LABELS)) check(s, 'MARK_LABELS')
  })

  it('has no negative wording in the JSX text or string literals of the screens', () => {
    const root = path.resolve(__dirname, '../..')
    const files = [
      ...walk(path.join(root, 'components/worship')),
      path.join(root, 'components/prayer/slots/row-tracker.tsx'),
      ...walk(path.join(root, 'app/tasbih')),
      ...walk(path.join(root, 'app/prayer/tracker')),
    ].filter((f) => f.endsWith('.tsx'))
    expect(files.length).toBeGreaterThan(3)
    let seen = 0
    for (const f of files) {
      for (const t of jsxText(f)) {
        check(t, path.basename(f))
        seen++
      }
    }
    expect(seen).toBeGreaterThan(0) // the scan is really reading the screens (most copy comes from copy.ts)
  })
})

function walk(dir: string): string[] {
  let out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    out = statSync(p).isDirectory() ? out.concat(walk(p)) : out.concat(p)
  }
  return out
}

/** The words a screen shows: JSX text, and string literals given to text-bearing attributes */
function jsxText(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && node.text.trim()) out.push(node.text.trim())
    if (ts.isJsxAttribute(node) && /^(aria-label|title|placeholder|alt)$/.test(node.name.getText(sf))) {
      const init = node.initializer
      if (init && ts.isStringLiteral(init)) out.push(init.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}
