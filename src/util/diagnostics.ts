// Diagnostic layer (Phase 4). Mechanical lints only — no LLM judgment in the
// harness. Semantic lints (continuity, outline drift by meaning, POV/tense,
// dangling promises) are the agent's job, not the harness's.
//
// Three categories ship here:
//   missing_summary  — section without a summary attribute
//   pacing_outlier   — section ≥2× or ≤½× median word count
//   repetition       — long word (≥5 chars, non-pronoun) appearing ≥5× in one section
//
// Findings have stable ids derived from hash(kind|section|key) where `key`
// is a canonical slug (e.g. "long"/"short" for pacing, the offending word
// for repetition). Volatile counts stay only in the human message so the
// same problem produces the same id across normal manuscript edits.
// Suppressions live in memory.md as a `## Suppressed` block; check()
// filters them out.

import { hashContent, parse } from "./sections.js";
import type { OpResult, ParseError } from "./sections.js";

export type FindingKind = "missing_summary" | "pacing_outlier" | "repetition";

export interface Finding {
  id: string;
  kind: FindingKind;
  section: string;
  message: string;
  suggestion?: string;
}

const PACING_FACTOR = 2;
const MIN_SECTIONS_FOR_PACING = 3;
const REPETITION_MIN_LEN = 5;
const REPETITION_THRESHOLD = 5;

const PRONOUNS = new Set([
  "he", "she", "they", "him", "her", "them", "his", "hers", "their", "theirs",
  "its", "we", "us", "our", "you", "your", "yours", "they", "this", "that",
  "these", "those", "there", "these", "what", "when", "where", "which", "while",
]);

export function check(
  manuscriptSource: string,
  memorySource: string,
): { findings: Finding[]; errors: ParseError[] } {
  const r = parse(manuscriptSource);
  // Refuse on parse errors — diagnostics over malformed markup would mislead.
  if (r.errors.length) return { findings: [], errors: r.errors };

  const realSections = r.sections.filter((s) => !s.synthetic);
  const noteSpansBySection = groupNoteSpans(r);
  const findings: Finding[] = [];

  // 1) Missing summary
  for (const s of realSections) {
    if (!s.summary || !s.summary.trim()) {
      findings.push(
        finding(
          "missing_summary",
          s.id,
          "",
          `section "${s.id}" has no summary`,
          'add summary="..." to the section open tag',
        ),
      );
    }
  }

  // 2) Pacing outliers. Stable id key: kind|section|long|short — survives
  // word-count and median changes that don't flip direction.
  if (realSections.length >= MIN_SECTIONS_FOR_PACING) {
    const counts = realSections.map((s) => ({
      id: s.id,
      words: countProseWords(s.body, noteSpansBySection.get(s.id) ?? []),
    }));
    const median = medianOf(counts.map((c) => c.words));
    if (median > 0) {
      for (const c of counts) {
        if (c.words >= median * PACING_FACTOR) {
          findings.push(
            finding(
              "pacing_outlier",
              c.id,
              "long",
              `section "${c.id}" is ${c.words} words; median is ${median}`,
              "consider splitting or trimming",
            ),
          );
        } else if (c.words * PACING_FACTOR <= median) {
          findings.push(
            finding(
              "pacing_outlier",
              c.id,
              "short",
              `section "${c.id}" is ${c.words} words; median is ${median}`,
              "consider expanding or merging",
            ),
          );
        }
      }
    }
  }

  // 3) Repetition per section. Stable id key: kind|section|word —
  // survives count drift across passes.
  for (const s of realSections) {
    const reps = findRepetitions(s.body);
    for (const { word, count } of reps) {
      findings.push(
        finding(
          "repetition",
          s.id,
          word,
          `"${word}" appears ${count} times in section "${s.id}"`,
          "vary word choice",
        ),
      );
    }
  }

  // Filter suppressed
  const suppressed = parseSuppressed(memorySource);
  return {
    findings: findings.filter((f) => !suppressed.has(f.id)),
    errors: [],
  };
}

export function suppress(
  memorySource: string,
  findingId: string,
  reason: string,
): OpResult<{ newMemorySource: string }> {
  if (!/^[0-9a-f]{12}$/i.test(findingId)) {
    return { ok: false, error: `invalid finding id "${findingId}" (expected 12 hex chars)` };
  }
  const cleanReason = reason.trim().replace(/\s+/g, " ");
  if (!cleanReason) return { ok: false, error: "'reason' is required" };
  const line = `- ${findingId} — ${cleanReason}`;

  const re = /(##\s+Suppressed\s*\n)([\s\S]*?)(?=\n##\s|$)/i;
  const m = memorySource.match(re);
  if (m) {
    if (m[2].includes(findingId)) {
      // Idempotent — already suppressed.
      return { ok: true, value: { newMemorySource: memorySource } };
    }
    const before = memorySource.slice(0, m.index! + m[1].length);
    const body = m[2].replace(/\s+$/, "");
    const after = memorySource.slice(m.index! + m[0].length);
    const newBody = body ? `${body}\n${line}\n` : `${line}\n`;
    return { ok: true, value: { newMemorySource: before + newBody + after } };
  }

  // No block yet — append one.
  let sep: string;
  if (memorySource.length === 0) sep = "";
  else if (memorySource.endsWith("\n\n")) sep = "";
  else if (memorySource.endsWith("\n")) sep = "\n";
  else sep = "\n\n";
  return {
    ok: true,
    value: { newMemorySource: memorySource + sep + `## Suppressed\n${line}\n` },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

// `key` is the stable identity slug that should NOT include volatile counts.
// `message` is the human-readable text that may reference current counts.
function finding(
  kind: FindingKind,
  section: string,
  key: string,
  message: string,
  suggestion?: string,
): Finding {
  const id = hashContent(`${kind}|${section}|${key}`);
  return { id, kind, section, message, suggestion };
}

function parseSuppressed(memorySource: string): Set<string> {
  const ids = new Set<string>();
  const m = memorySource.match(/##\s+Suppressed\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!m) return ids;
  for (const line of m[1].split("\n")) {
    const idMatch = line.match(/\b([0-9a-f]{12})\b/i);
    if (idMatch) ids.add(idMatch[1].toLowerCase());
  }
  return ids;
}

function groupNoteSpans(r: ReturnType<typeof parse>): Map<string, Array<[number, number]>> {
  const out = new Map<string, Array<[number, number]>>();
  for (const n of r.notes) {
    const arr = out.get(n.section) ?? [];
    // We pass body-relative spans in countProseWords, so convert section-source
    // offsets to body-relative: but countProseWords uses the body string directly,
    // so we just strip notes via regex inside the body. Simpler — drop the spans.
    arr.push([n.start, n.end]);
    out.set(n.section, arr);
  }
  return out;
}

function countProseWords(body: string, _spans: Array<[number, number]>): number {
  // The spans are source-absolute; we operate on the body string. Strip
  // <note> via regex on the body — same strategy used in sections.ts.
  const stripped = body.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, "");
  return (stripped.match(/\S+/g) || []).length;
}

function findRepetitions(body: string): Array<{ word: string; count: number }> {
  const stripped = body.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, "");
  const counts = new Map<string, number>();
  for (const w of (stripped.toLowerCase().match(/\b[a-z]+\b/g) || [])) {
    if (w.length < REPETITION_MIN_LEN || PRONOUNS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const out: Array<{ word: string; count: number }> = [];
  for (const [word, count] of counts) {
    if (count >= REPETITION_THRESHOLD) out.push({ word, count });
  }
  return out.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
