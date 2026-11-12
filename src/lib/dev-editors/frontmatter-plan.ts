// Whether a card's own frontmatter already satisfies an editor, and the textual
// edit that makes it so. Pure: plain text in, plain text out. Only top-level
// `key: value` lines are read or written; comments, other keys and key order
// are never touched (a gray-matter round-trip would rewrite them).

import { setInspectedFalse } from '../site/inspected-gate.ts';

export type PropertyPlan = { kind: 'missing' } | { kind: 'matches' } | { kind: 'conflicts'; old: string; new: string };
export type FrontmatterPlan = Record<string, PropertyPlan>;
export type FrontmatterValues = Record<string, string | number | boolean>;

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;
const KEY_LINE = /^([A-Za-z0-9_-]+)\s*:(.*)$/;

const bodyLines = (text: string) => BLOCK.exec(text)?.[1].split('\n') ?? [];

/** A scalar's text: trailing comment and one layer of quotes removed. */
function scalar(raw: string): string {
  let v = raw.trim();
  const quote = /^(["'])((?:\\.|(?!\1).)*)\1/.exec(v);
  if (quote) return quote[2];
  v = v.replace(/\s+#.*$/, '').trim();
  return v;
}

export function frontmatterPlan(text: string, wanted: FrontmatterValues): FrontmatterPlan {
  const own = new Map<string, string>();
  for (const line of bodyLines(text)) {
    const m = KEY_LINE.exec(line);
    if (m) own.set(m[1], scalar(m[2]));
  }
  const plan: FrontmatterPlan = {};
  for (const [key, value] of Object.entries(wanted)) {
    const next = String(value);
    if (!own.has(key)) plan[key] = { kind: 'missing' };
    else if (own.get(key) === next) plan[key] = { kind: 'matches' };
    else plan[key] = { kind: 'conflicts', old: own.get(key)!, new: next };
  }
  return plan;
}

const SAFE_PLAIN = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/;
export function frontmatterLine(key: string, value: string | number | boolean): string {
  return typeof value === 'string' && !SAFE_PLAIN.test(value) ? `${key}: ${JSON.stringify(value)}` : `${key}: ${value}`;
}

/** Applies a plan: conflicts replaced in place, missing appended, and `inspected: false` if anything changed. */
export function applyFrontmatterPlan(text: string, wanted: FrontmatterValues, plan: FrontmatterPlan): string {
  const changes = Object.entries(plan).filter(([, p]) => p.kind !== 'matches');
  if (changes.length === 0) return text;
  const hasBlock = BLOCK.test(text);
  const lines = bodyLines(text);
  const out: string[] = [];
  const replaced = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const m = KEY_LINE.exec(lines[i]);
    if (m && plan[m[1]]?.kind === 'conflicts') {
      out.push(frontmatterLine(m[1], wanted[m[1]]));
      replaced.add(m[1]);
      while (i + 1 < lines.length && /^(\s+|-\s)/.test(lines[i + 1])) i++; // its continuation lines
    } else out.push(lines[i]);
  }
  for (const [key, p] of changes) if (p.kind === 'missing') out.push(frontmatterLine(key, wanted[key]));
  const raw = hasBlock
    ? text.replace(BLOCK, () => `---\n${out.join('\n')}\n---`)
    : `---\n${out.join('\n')}\n---\n${text}`;
  return setInspectedFalse(raw);
}
