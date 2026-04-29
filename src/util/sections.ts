// Section + note parsing and operations for the structural layer.
// Pure functions over strings; file IO lives in the tool handlers.
//
// Markup contract (DESIGN.md §1):
//   <section id="..." title="..." summary="...">prose</section>
//   <note source="agent|user" status="open|addressed|deferred">...</note>
// Reserved tags must be well-formed (matched, attributes in name="value" form;
// quote chars in attribute values escaped as &quot;). Non-reserved <foo>...
// content in prose passes through verbatim. The only literal sequences to
// escape in prose are </section> and </note> themselves.

import { createHash } from "node:crypto";
import { xmlUnescape } from "./xml.js";

export const WHOLE_FILE_ID = "__whole_file__";
const SECTION_CLOSE_TAG = "</section>";
const NOTE_CLOSE_TAG = "</note>";

export interface ParsedSection {
  id: string;
  title?: string;
  summary?: string;
  body: string;
  // Offsets into the source string. For the synthetic whole-file section,
  // bodyStart/bodyEnd cover the whole file and openStart/closeEnd match.
  openStart: number;
  bodyStart: number;
  bodyEnd: number;
  closeEnd: number;
  hash: string;
  synthetic: boolean;
}

export interface ParsedNote {
  // Containing section id. Empty string if the note appears outside any
  // section in a manuscript that has real sections. WHOLE_FILE_ID when
  // the manuscript has no real sections (the whole file is synthetic).
  section: string;
  source: "agent" | "user";
  status: "open" | "addressed" | "deferred";
  content: string;
  // Zero-based index of this note within its containing section, in
  // appearance order, counting all notes (agent and user). Combined
  // with `hash`, the handle for resolveNote().
  indexInSection: number;
  // Content hash over the entire <note ...>...</note> span. Required as
  // expectedHash on resolveNote so a positional handle can't silently
  // resolve the wrong note when notes shift between calls.
  hash: string;
  start: number;
  end: number;
}

export type ParseErrorKind =
  | "unclosed_section"
  | "duplicate_id"
  | "missing_id"
  | "nested_section"
  | "stray_section_close"
  | "unclosed_note"
  | "stray_note_close"
  | "bad_attribute";

export interface ParseError {
  kind: ParseErrorKind;
  message: string;
  position: number;
}

export interface ParseResult {
  sections: ParsedSection[];
  notes: ParsedNote[];
  errors: ParseError[];
  hasRealSections: boolean;
}

// Single tag matcher for both reserved tags. The non-greedy [^>]* matches
// up to the first '>' which is fine because attribute values can't contain
// '>' under our contract (literal '>' must be escaped as &gt;).
const RESERVED_TAG = /<(\/?)(section|note)\b([^>]*)>/g;
const ATTR = /(\w+)\s*=\s*"([^"]*)"/g;
const ATTR_NAME_ONLY = /\b\w+\b/g;

export function parse(source: string): ParseResult {
  const errors: ParseError[] = [];
  const sections: ParsedSection[] = [];
  const notes: ParsedNote[] = [];
  const seenIds = new Set<string>();
  const noteIdxBySection: Record<string, number> = Object.create(null);

  let active: {
    id: string;
    title?: string;
    summary?: string;
    openStart: number;
    bodyStart: number;
  } | null = null;

  RESERVED_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RESERVED_TAG.exec(source)) !== null) {
    const isClose = m[1] === "/";
    const tagName = m[2];
    const rawAttrs = m[3];
    const start = m.index;
    const end = start + m[0].length;

    if (tagName === "section") {
      if (isClose) {
        if (!active) {
          errors.push({
            kind: "stray_section_close",
            message: "</section> with no matching open",
            position: start,
          });
          continue;
        }
        const body = source.slice(active.bodyStart, start);
        sections.push({
          id: active.id,
          title: active.title,
          summary: active.summary,
          body,
          openStart: active.openStart,
          bodyStart: active.bodyStart,
          bodyEnd: start,
          closeEnd: end,
          hash: hashContent(body),
          synthetic: false,
        });
        active = null;
      } else {
        if (active) {
          errors.push({
            kind: "nested_section",
            message: `<section> nested inside <section id="${active.id}">`,
            position: start,
          });
          // Skip to the inner close so the outer pairing can still resolve.
          const innerClose = source.indexOf(SECTION_CLOSE_TAG, end);
          if (innerClose !== -1) {
            RESERVED_TAG.lastIndex = innerClose + SECTION_CLOSE_TAG.length;
          }
          continue;
        }
        const attrErr = validateAttrSyntax(rawAttrs);
        if (attrErr) {
          errors.push({
            kind: "bad_attribute",
            message: `<section>: ${attrErr}`,
            position: start,
          });
        }
        const attrs = parseAttrs(rawAttrs);
        if (!attrs.id) {
          errors.push({
            kind: "missing_id",
            message: "<section> missing required id attribute",
            position: start,
          });
          continue;
        }
        if (seenIds.has(attrs.id)) {
          errors.push({
            kind: "duplicate_id",
            message: `duplicate section id "${attrs.id}"`,
            position: start,
          });
        }
        seenIds.add(attrs.id);
        active = {
          id: attrs.id,
          title: attrs.title,
          summary: attrs.summary,
          openStart: start,
          bodyStart: end,
        };
      }
    } else {
      // tagName === "note"
      if (isClose) {
        errors.push({
          kind: "stray_note_close",
          message: "</note> with no matching open",
          position: start,
        });
        continue;
      }
      const noteClose = source.indexOf(NOTE_CLOSE_TAG, end);
      if (noteClose === -1) {
        errors.push({
          kind: "unclosed_note",
          message: "<note> not closed",
          position: start,
        });
        break;
      }
      const attrErr = validateAttrSyntax(rawAttrs);
      if (attrErr) {
        errors.push({
          kind: "bad_attribute",
          message: `<note>: ${attrErr}`,
          position: start,
        });
      }
      const attrs = parseAttrs(rawAttrs);
      const noteSource: "agent" | "user" = attrs.source === "user" ? "user" : "agent";
      const status: ParsedNote["status"] =
        attrs.status === "addressed" || attrs.status === "deferred" ? attrs.status : "open";
      const sectionAttribution = active ? active.id : "";
      const idx = noteIdxBySection[sectionAttribution] ?? 0;
      noteIdxBySection[sectionAttribution] = idx + 1;
      const noteEnd = noteClose + NOTE_CLOSE_TAG.length;
      notes.push({
        section: sectionAttribution,
        source: noteSource,
        status,
        content: xmlUnescape(source.slice(end, noteClose)),
        indexInSection: idx,
        hash: hashContent(source.slice(start, noteEnd)),
        start,
        end: noteEnd,
      });
      RESERVED_TAG.lastIndex = noteEnd;
    }
  }

  if (active) {
    errors.push({
      kind: "unclosed_section",
      message: `<section id="${active.id}"> is not closed`,
      position: active.openStart,
    });
  }

  // Synthetic whole-file fallback only when the file is clean and has no
  // real sections. Re-attribute any top-level notes to __whole_file__ so
  // listings and resolve_note have a consistent handle.
  if (sections.length === 0 && errors.length === 0) {
    sections.push({
      id: WHOLE_FILE_ID,
      body: source,
      openStart: 0,
      bodyStart: 0,
      bodyEnd: source.length,
      closeEnd: source.length,
      hash: hashContent(source),
      synthetic: true,
    });
    let i = 0;
    for (const n of notes) {
      n.section = WHOLE_FILE_ID;
      n.indexInSection = i++;
    }
  }

  return {
    sections,
    notes,
    errors,
    hasRealSections: sections.some((s) => !s.synthetic),
  };
}

// Strip all `name="value"` attributes from the raw text and see what's left.
// Anything non-whitespace is malformed (unquoted attribute, dangling text,
// unmatched quotes, etc.). Heuristic but catches the common breakages.
function validateAttrSyntax(raw: string): string | null {
  ATTR.lastIndex = 0;
  let stripped = raw.replace(ATTR, "");
  // Also tolerate boolean-style attributes? No — our schema requires values.
  stripped = stripped.replace(/\s+/g, " ").trim();
  if (stripped) {
    return `unrecognized attribute syntax: "${stripped}"`;
  }
  return null;
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(s)) !== null) {
    out[m[1]] = xmlUnescape(m[2]);
  }
  return out;
}

export function hashContent(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

// ── Operations ──────────────────────────────────────────────────────────

export interface OutlineEntry {
  id: string;
  title?: string;
  summary?: string;
  words: number;
  hash: string;
  synthetic?: boolean;
}

export function outline(source: string): {
  entries: OutlineEntry[];
  errors: ParseError[];
} {
  const r = parse(source);
  const entries = r.sections.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    words: countWords(s.body),
    hash: s.hash,
    synthetic: s.synthetic || undefined,
  }));
  return { entries, errors: r.errors };
}

export type OpResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function readSection(
  source: string,
  id: string,
): OpResult<{ content: string; hash: string; synthetic: boolean }> {
  const r = parse(source);
  if (r.errors.length) return parseErrors(r.errors);
  const sec = r.sections.find((s) => s.id === id);
  if (!sec) return { ok: false, error: `no section with id "${id}"` };
  return {
    ok: true,
    value: { content: sec.body, hash: sec.hash, synthetic: sec.synthetic },
  };
}

export function patchSection(
  source: string,
  id: string,
  content: string,
  expectedHash: string,
): OpResult<{ newSource: string; hash: string }> {
  const r = parse(source);
  if (r.errors.length) return parseErrors(r.errors);
  const sec = r.sections.find((s) => s.id === id);
  if (!sec) return { ok: false, error: `no section with id "${id}"` };
  if (sec.hash !== expectedHash) {
    return {
      ok: false,
      error: `expectedHash mismatch for section "${id}" (have ${sec.hash}, got ${expectedHash}); read the section first`,
    };
  }
  const stitched = sec.synthetic
    ? content
    : source.slice(0, sec.bodyStart) + content + source.slice(sec.bodyEnd);
  const validation = parse(stitched);
  if (validation.errors.length) {
    // Common mistake: the agent passed `<section ...>body</section>` as content
    // instead of just the body. The parser reports nested_section, but that
    // wording is opaque in this context — give a targeted hint.
    if (
      !sec.synthetic &&
      validation.errors[0].kind === "nested_section" &&
      /^\s*<section\b/.test(content)
    ) {
      return {
        ok: false,
        error:
          'patch_section content must be the BODY ONLY — do not include the surrounding <section ...> ... </section> wrapper. The harness preserves the existing wrapper and its attributes.',
      };
    }
    return {
      ok: false,
      error: `replacement would produce malformed markup: ${validation.errors[0].message}`,
    };
  }
  return { ok: true, value: { newSource: stitched, hash: hashContent(content) } };
}

export function replaceInSection(
  source: string,
  id: string,
  find: string,
  replace: string,
  expectedHash: string,
): OpResult<{ newSource: string; hash: string }> {
  if (!find) return { ok: false, error: "'find' must be non-empty" };
  const r = parse(source);
  if (r.errors.length) return parseErrors(r.errors);
  const sec = r.sections.find((s) => s.id === id);
  if (!sec) return { ok: false, error: `no section with id "${id}"` };
  if (sec.hash !== expectedHash) {
    return {
      ok: false,
      error: `expectedHash mismatch for section "${id}" (have ${sec.hash}, got ${expectedHash}); read the section first`,
    };
  }
  const count = countOccurrences(sec.body, find);
  if (count === 0) {
    return { ok: false, error: `'find' not found in section "${id}"` };
  }
  if (count > 1) {
    return {
      ok: false,
      error: `'find' matches ${count} places in section "${id}"; must match exactly once. Include more surrounding context.`,
    };
  }
  const newBody = sec.body.replace(find, replace);
  const stitched = sec.synthetic
    ? newBody
    : source.slice(0, sec.bodyStart) + newBody + source.slice(sec.bodyEnd);
  const validation = parse(stitched);
  if (validation.errors.length) {
    return {
      ok: false,
      error: `replacement would produce malformed markup: ${validation.errors[0].message}`,
    };
  }
  return { ok: true, value: { newSource: stitched, hash: hashContent(newBody) } };
}

// Strip every <note>...</note> (top-level and in-section), strip <section>
// open/close tags, decode entity escapes. Preserves body text and spacing.
export function render(source: string): { rendered: string; errors: ParseError[] } {
  const r = parse(source);
  // First pass: remove all notes via parsed offsets so removal is precise.
  // Walk notes back-to-front to keep earlier offsets valid.
  let stripped = source;
  const sortedNotes = [...r.notes].sort((a, b) => b.start - a.start);
  for (const n of sortedNotes) {
    stripped = stripped.slice(0, n.start) + stripped.slice(n.end);
  }
  // Second pass: re-parse the note-stripped text to find section open/close
  // offsets and remove them. Don't reuse old offsets — they're invalid now.
  const r2 = parse(stripped);
  // Walk sections back-to-front. Real sections only.
  const realSections = r2.sections.filter((s) => !s.synthetic).sort((a, b) => b.openStart - a.openStart);
  for (const s of realSections) {
    // Remove </section> first, then <section ...>, since we walk back-to-front.
    stripped =
      stripped.slice(0, s.bodyEnd) +
      stripped.slice(s.closeEnd);
    stripped =
      stripped.slice(0, s.openStart) +
      stripped.slice(s.bodyStart);
  }
  return { rendered: xmlUnescape(stripped), errors: r.errors };
}

export function listNotes(source: string): {
  entries: ParsedNote[];
  errors: ParseError[];
} {
  const r = parse(source);
  return { entries: r.notes, errors: r.errors };
}

export function unresolved(source: string): {
  entries: ParsedNote[];
  errors: ParseError[];
} {
  const r = parse(source);
  const entries = r.notes.filter((n) => n.source === "user" && n.status === "open");
  return { entries, errors: r.errors };
}

export function resolveNote(
  source: string,
  sectionId: string,
  index: number,
  expectedHash: string,
  newStatus: "addressed" | "deferred" | "open",
): OpResult<{ newSource: string }> {
  const r = parse(source);
  if (r.errors.length) return parseErrors(r.errors);
  const sectionNotes = r.notes.filter((n) => n.section === sectionId);
  if (sectionNotes.length === 0) {
    return {
      ok: false,
      error: sectionId
        ? `section "${sectionId}" has no notes`
        : "no top-level notes in this manuscript",
    };
  }
  if (index < 0 || index >= sectionNotes.length) {
    const where = sectionId ? `section "${sectionId}"` : "top-level";
    return {
      ok: false,
      error: `${where} has ${sectionNotes.length} notes; index ${index} out of range`,
    };
  }
  const note = sectionNotes[index];
  if (note.hash !== expectedHash) {
    return {
      ok: false,
      error: `expectedHash mismatch for note (have ${note.hash}, got ${expectedHash}); the note changed since you read it. Re-read via notes() or unresolved() and retry.`,
    };
  }
  const span = source.slice(note.start, note.end);
  const openEnd = span.indexOf(">");
  if (openEnd === -1) {
    return { ok: false, error: "internal: malformed note span" };
  }
  const openTag = span.slice(0, openEnd + 1);
  const inner = openTag.slice("<note".length, -1).trim();
  const attrs = parseAttrs(inner);
  attrs.status = newStatus;
  if (!attrs.source) attrs.source = "agent";
  const newOpen = buildNoteOpenTag(attrs);
  const newSpan = newOpen + span.slice(openEnd + 1);
  const newSource = source.slice(0, note.start) + newSpan + source.slice(note.end);
  const validation = parse(newSource);
  if (validation.errors.length) {
    return {
      ok: false,
      error: `note rewrite produced malformed markup: ${validation.errors[0].message}`,
    };
  }
  return { ok: true, value: { newSource } };
}

function buildNoteOpenTag(attrs: Record<string, string>): string {
  const parts: string[] = ["<note"];
  const known = ["source", "status"];
  for (const k of known) {
    if (attrs[k] !== undefined) parts.push(` ${k}="${escapeAttr(attrs[k])}"`);
  }
  const extras = Object.keys(attrs)
    .filter((k) => !known.includes(k))
    .sort();
  for (const k of extras) {
    parts.push(` ${k}="${escapeAttr(attrs[k])}"`);
  }
  parts.push(">");
  return parts.join("");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

// ── Helpers ─────────────────────────────────────────────────────────────

function parseErrors<T>(errors: ParseError[]): OpResult<T> {
  return {
    ok: false,
    error: `manuscript has parse errors: ${errors.map((e) => e.message).join("; ")}`,
  };
}

function countWords(body: string): number {
  // Strip notes (with offsets we don't have here, so use regex).
  const stripped = body.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, "");
  return (stripped.match(/\S+/g) || []).length;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}
