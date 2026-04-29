// Entity layer (Phase 3): semantic indexing for prose.
//
// Convention: memory.md is Markdown. Each entity is a level-2 heading
// (`## Name`), optionally followed anywhere in the body by a single line
// `aliases: a, b, c`. Pronouns are not aliases (would make references()
// too noisy); coreference resolution is a future LLM-driven extension.

import { parse } from "./sections.js";
import type { OpResult } from "./sections.js";

const HEADING = /^##\s+(.+?)\s*$/;
const ALIASES = /^\s*aliases\s*:\s*(.+?)\s*$/i;
const FENCE = /^\s*(```|~~~)/;

export interface ParsedEntity {
  name: string;
  aliases: string[];
  body: string;
}

export interface Reference {
  section: string; // containing section id, "" for top-level prose
  excerpt: string;
  matched: string; // the term/alias that produced this hit (for drift spotting)
  position: number; // offset in manuscript source, for stable ordering
}

export function parseEntities(source: string): ParsedEntity[] {
  const lines = source.split("\n");
  const out: ParsedEntity[] = [];
  let cur: { name: string; bodyLines: string[] } | null = null;
  let inFence = false;

  const finalize = () => {
    if (!cur) return;
    const body = cur.bodyLines.join("\n");
    out.push({ name: cur.name, aliases: extractAliases(body), body });
    cur = null;
  };

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      if (cur) cur.bodyLines.push(line);
      continue;
    }
    if (inFence) {
      if (cur) cur.bodyLines.push(line);
      continue;
    }
    const m = line.match(HEADING);
    if (m) {
      finalize();
      cur = { name: m[1].trim(), bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    }
  }
  finalize();

  return out;
}

// Extract a single `aliases: a, b, c` line from an entity body. Skips
// fenced code blocks so prose snippets that mention "aliases:" inside
// triple-backtick blocks aren't picked up.
function extractAliases(body: string): string[] {
  let inFence = false;
  for (const line of body.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(ALIASES);
    if (m) {
      return m[1].split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

// Lookup: direct canonical-name match wins; falls back to alias match so
// `define("Dr. Vasquez")` resolves to the `## Elena` entity that lists
// `Dr. Vasquez` as an alias. Symmetric with how rename_entity expects
// to resolve any handle to a canonical entity.
function findEntity(entities: ParsedEntity[], name: string): ParsedEntity | undefined {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  const direct = entities.find((e) => e.name.trim().toLowerCase() === target);
  if (direct) return direct;
  return entities.find((e) =>
    e.aliases.some((a) => a.trim().toLowerCase() === target),
  );
}

export function defineEntity(memorySource: string, name: string): OpResult<string> {
  if (!name.trim()) return { ok: false, error: "'name' is required" };
  const entities = parseEntities(memorySource);
  const found = findEntity(entities, name);
  if (!found) {
    return {
      ok: false,
      error: `no entity entry for "${name}" in memory.md (expected a "## ${name}" heading)`,
    };
  }
  const body = found.body.replace(/^\n+|\n+$/g, "");
  return { ok: true, value: body ? `## ${found.name}\n${body}` : `## ${found.name}` };
}

// Resolve search terms for a name: if memory.md has an entry, use the
// canonical name + all declared aliases; otherwise fall back to the
// raw input name. Returns the entity (if found) for caller diagnostics.
export function resolveTerms(
  memorySource: string,
  name: string,
): { entity: ParsedEntity | null; terms: string[] } {
  const entities = parseEntities(memorySource);
  const found = findEntity(entities, name);
  if (found) {
    return { entity: found, terms: [found.name, ...found.aliases] };
  }
  return { entity: null, terms: [name] };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a case-insensitive regex with word boundaries only at ends that
// are word characters. Multi-word terms with punctuation (e.g., "Dr.
// Vasquez") still match cleanly because we anchor on the outer chars.
function buildPattern(term: string): RegExp | null {
  const t = term.trim();
  if (!t) return null;
  const startB = /\w/.test(t[0]) ? "\\b" : "";
  const endB = /\w/.test(t[t.length - 1]) ? "\\b" : "";
  return new RegExp(`${startB}${escapeRegex(t)}${endB}`, "gi");
}

export function findReferences(
  manuscriptSource: string,
  terms: string[],
): OpResult<{ entries: Reference[] }> {
  // Dedup terms case-insensitively, preserving caller's casing for `matched`.
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const t of terms) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(trimmed);
  }
  if (!ordered.length) return { ok: false, error: "no search terms" };

  const parsed = parse(manuscriptSource);
  // Forbidden ranges: matches that fall inside these are not prose hits.
  // (1) note spans — entire <note>...</note>, including content
  // (2) section open/close tag spans — id, title, summary attribute values
  const forbidden: Array<[number, number]> = [];
  for (const n of parsed.notes) forbidden.push([n.start, n.end]);
  for (const s of parsed.sections) {
    if (s.synthetic) continue;
    forbidden.push([s.openStart, s.bodyStart]);
    forbidden.push([s.bodyEnd, s.closeEnd]);
  }
  const inForbidden = (pos: number): boolean =>
    forbidden.some(([a, b]) => pos >= a && pos < b);

  // Sort once for excerpt sanitization (which walks them in order).
  const sortedForbidden = [...forbidden].sort((a, b) => a[0] - b[0]);

  // Collect raw hits across all terms. Each hit knows which term produced
  // it so we can attribute drift later. Skip hits whose start sits inside
  // a forbidden span (note body or section tag).
  const raw: Array<{ start: number; end: number; term: string }> = [];
  for (const term of ordered) {
    const pat = buildPattern(term);
    if (!pat) continue;
    let m: RegExpExecArray | null;
    pat.lastIndex = 0;
    while ((m = pat.exec(manuscriptSource)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) pat.lastIndex++;
      if (inForbidden(start)) continue;
      raw.push({ start, end, term });
    }
  }

  // Dedup overlapping hits — `Elena` and `Elena Vasquez` both match at
  // "Elena Vasquez arrived". Sort by start asc, then by length desc so
  // longer matches win at the same position. Greedy walk keeps one
  // non-overlapping hit per region; preferred for rename_entity which
  // needs each location once.
  raw.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const accepted: typeof raw = [];
  let lastEnd = -1;
  for (const h of raw) {
    if (h.start >= lastEnd) {
      accepted.push(h);
      lastEnd = h.end;
    }
  }

  const entries: Reference[] = accepted.map((h) => {
    const sec = parsed.sections.find((s) => h.start >= s.openStart && h.start < s.closeEnd);
    return {
      section: sec ? sec.id : "",
      excerpt: makeExcerpt(manuscriptSource, h.start, h.end, sortedForbidden),
      matched: h.term,
      position: h.start,
    };
  });
  return { ok: true, value: { entries } };
}

// Build an excerpt around [start, end], skipping over any forbidden spans
// (note blocks, section open/close tags) that intersect the window. The
// regex-only approach missed leaks when the window opened mid-note.
function makeExcerpt(
  text: string,
  start: number,
  end: number,
  forbidden: ReadonlyArray<readonly [number, number]>,
  padding = 40,
): string {
  const left = Math.max(0, start - padding);
  const right = Math.min(text.length, end + padding);

  let out = "";
  let cursor = left;
  for (const [a, b] of forbidden) {
    if (b <= cursor) continue; // span ends before window
    if (a >= right) break; // span starts after window
    const skipStart = Math.max(a, cursor);
    const skipEnd = Math.min(b, right);
    if (skipStart > cursor) out += text.slice(cursor, skipStart);
    cursor = skipEnd;
  }
  if (cursor < right) out += text.slice(cursor, right);

  const prefix = left > 0 ? "…" : "";
  const suffix = right < text.length ? "…" : "";
  return (prefix + out.replace(/\s+/g, " ") + suffix).trim();
}
