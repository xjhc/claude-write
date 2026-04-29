// Tests for the structural + steering layers (Phase 1 + 2).
// Imports compiled output from dist/. Run via `npm test` after `npm run build`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  parse,
  outline,
  readSection,
  patchSection,
  replaceInSection,
  render,
  listNotes,
  unresolved,
  resolveNote,
  hashContent,
  WHOLE_FILE_ID,
} from "../dist/util/sections.js";

// ── Parsing: synthetic / unsectioned ────────────────────────────────────

test("synthetic whole-file section for unsectioned input", () => {
  const src = "Once upon a time.\nLine two.\n";
  const r = parse(src);
  assert.equal(r.sections.length, 1);
  assert.equal(r.sections[0].id, WHOLE_FILE_ID);
  assert.equal(r.sections[0].synthetic, true);
  assert.equal(r.hasRealSections, false);
});

test("synthetic does NOT appear when real sections exist", () => {
  const src = `<section id="a" summary="s">x</section>`;
  const r = parse(src);
  assert.equal(r.sections.length, 1);
  assert.equal(r.sections[0].synthetic, false);
  assert.equal(r.hasRealSections, true);
});

test("synthetic suppressed when input has parse errors", () => {
  const src = `</section>plain text`;
  const r = parse(src);
  assert.ok(r.errors.length > 0);
  assert.ok(!r.sections.some((s) => s.synthetic));
});

// ── Parsing: section attributes ─────────────────────────────────────────

test("missing id flagged", () => {
  const r = parse(`<section summary="x">y</section>`);
  assert.ok(r.errors.some((e) => e.kind === "missing_id"));
});

test("duplicate id flagged", () => {
  const r = parse(`<section id="a" summary="s">x</section><section id="a" summary="t">y</section>`);
  assert.ok(r.errors.some((e) => e.kind === "duplicate_id"));
});

test("unclosed section flagged", () => {
  const r = parse(`<section id="a" summary="s">forever`);
  assert.ok(r.errors.some((e) => e.kind === "unclosed_section"));
});

test("nested section flagged", () => {
  const r = parse(
    `<section id="outer" summary="s"><section id="inner" summary="s">x</section></section>`,
  );
  assert.ok(r.errors.some((e) => e.kind === "nested_section"));
});

test("unquoted attribute flagged as bad_attribute", () => {
  const r = parse(`<section id=opening>x</section>`);
  assert.ok(r.errors.some((e) => e.kind === "bad_attribute"));
});

test("rogue extra attribute text flagged", () => {
  const r = parse(`<section id="a" summary="s" rogue=stuff>x</section>`);
  assert.ok(r.errors.some((e) => e.kind === "bad_attribute"));
});

test("title and summary attributes preserved", () => {
  const r = parse(`<section id="a" title="The Tomb" summary="Elena enters">x</section>`);
  assert.equal(r.sections[0].title, "The Tomb");
  assert.equal(r.sections[0].summary, "Elena enters");
});

test("escaped quote in attribute decoded", () => {
  const r = parse(`<section id="a" summary="she said &quot;hi&quot;">x</section>`);
  assert.equal(r.sections[0].summary, 'she said "hi"');
});

// ── Parsing: stray closes (regression for the reviewer's High 1) ────────

test("stray </section> before any open is flagged", () => {
  const r = parse(`</section><section id="a" summary="s">x</section>`);
  assert.ok(r.errors.some((e) => e.kind === "stray_section_close"));
});

test("stray </section> after a closed section is flagged", () => {
  const r = parse(`<section id="a" summary="s">x</section></section>`);
  assert.ok(r.errors.some((e) => e.kind === "stray_section_close"));
});

test("stray </note> is flagged", () => {
  const r = parse(`<section id="a" summary="s">x</note></section>`);
  assert.ok(r.errors.some((e) => e.kind === "stray_note_close"));
});

test("unclosed <note> is flagged", () => {
  const r = parse(`<section id="a" summary="s"><note>open forever</section>`);
  assert.ok(r.errors.some((e) => e.kind === "unclosed_note"));
});

// ── Parsing: notes ──────────────────────────────────────────────────────

test("note attributes default to agent/open", () => {
  const r = parse(`<section id="a" summary="s"><note>plain</note></section>`);
  assert.equal(r.notes[0].source, "agent");
  assert.equal(r.notes[0].status, "open");
});

test("note source=user respected", () => {
  const r = parse(`<section id="a" summary="s"><note source="user">u</note></section>`);
  assert.equal(r.notes[0].source, "user");
});

test("notes get per-section indexInSection", () => {
  const src = `<section id="a" summary="s">
<note>n1</note>
<note source="user">n2</note>
<note>n3</note>
</section>`;
  const r = parse(src);
  assert.deepEqual(
    r.notes.map((n) => n.indexInSection),
    [0, 1, 2],
  );
});

test("indexInSection is independent per section", () => {
  const src = `<section id="a" summary="s"><note>a1</note><note>a2</note></section>
<section id="b" summary="s"><note>b1</note></section>`;
  const r = parse(src);
  const a = r.notes.filter((n) => n.section === "a");
  const b = r.notes.filter((n) => n.section === "b");
  assert.deepEqual(a.map((n) => n.indexInSection), [0, 1]);
  assert.deepEqual(b.map((n) => n.indexInSection), [0]);
});

// ── Parsing: top-level notes (regression for reviewer's Medium 1) ───────

test("top-level note in sectioned manuscript: section is empty string", () => {
  const src = `<note source="user">global feedback</note>
<section id="a" summary="s">x</section>`;
  const r = parse(src);
  const userNote = r.notes.find((n) => n.content === "global feedback");
  assert.ok(userNote);
  assert.equal(userNote.section, "");
});

test("top-level note in unsectioned manuscript: section is __whole_file__", () => {
  const r = parse(`<note source="user">feedback</note>plain text`);
  const userNote = r.notes.find((n) => n.content === "feedback");
  assert.ok(userNote);
  assert.equal(userNote.section, WHOLE_FILE_ID);
});

test("notes() lists top-level notes in sectioned manuscript", () => {
  const src = `<note source="user">global</note>
<section id="a" summary="s">x</section>`;
  const { entries } = listNotes(src);
  assert.ok(entries.some((n) => n.content === "global" && n.section === ""));
});

test("unresolved() includes top-level user notes", () => {
  const src = `<note source="user">global</note>
<section id="a" summary="s">x</section>`;
  const u = unresolved(src);
  assert.equal(u.entries.length, 1);
  assert.equal(u.entries[0].section, "");
});

// ── outline ─────────────────────────────────────────────────────────────

test("outline returns hash and word count", () => {
  const { entries } = outline(`<section id="a" summary="s">three small words</section>`);
  assert.equal(entries[0].words, 3);
  assert.match(entries[0].hash, /^[0-9a-f]{12}$/);
});

test("outline excludes notes from word count", () => {
  const src = `<section id="a" summary="s">prose body <note>a long agent reflection that is not prose</note></section>`;
  const { entries } = outline(src);
  assert.equal(entries[0].words, 2);
});

// ── readSection / patchSection / replaceInSection ──────────────────────

test("readSection returns body with hash", () => {
  const src = `<section id="a" summary="s">contents</section>`;
  const r = readSection(src, "a");
  assert.ok(r.ok);
  assert.equal(r.value.content, "contents");
  assert.equal(r.value.hash, hashContent("contents"));
});

test("readSection unknown id errors", () => {
  const r = readSection(`<section id="a" summary="s">x</section>`, "missing");
  assert.ok(!r.ok);
  assert.match(r.error, /no section with id/);
});

test("patchSection refuses on stale hash", () => {
  const src = `<section id="a" summary="s">x</section>`;
  const bad = patchSection(src, "a", "y", "deadbeefdead");
  assert.ok(!bad.ok);
  assert.match(bad.error, /expectedHash mismatch/);
});

test("patchSection accepts correct hash and rewrites body", () => {
  const src = `<section id="a" summary="s">x</section>`;
  const h = readSection(src, "a").value.hash;
  const r = patchSection(src, "a", "rewritten", h);
  assert.ok(r.ok);
  assert.match(r.value.newSource, /<section id="a" summary="s">rewritten<\/section>/);
});

test("patchSection refuses output that produces malformed markup", () => {
  const src = `<section id="a" summary="s">x</section>`;
  const h = readSection(src, "a").value.hash;
  // Unclosed <note> inside content — malformed but not the body-only mistake.
  const r = patchSection(src, "a", `<note>unclosed body`, h);
  assert.ok(!r.ok);
  assert.match(r.error, /malformed/);
});

test("patchSection gives targeted hint when content includes the section wrapper", () => {
  const src = `<section id="a" summary="s">x</section>`;
  const h = readSection(src, "a").value.hash;
  const r = patchSection(src, "a", `<section id="a" summary="s">new body</section>`, h);
  assert.ok(!r.ok);
  assert.match(r.error, /BODY ONLY/);
});

test("patchSection on synthetic replaces whole file", () => {
  const src = "raw text";
  const h = readSection(src, WHOLE_FILE_ID).value.hash;
  const r = patchSection(src, WHOLE_FILE_ID, `<section id="new" summary="s">started</section>`, h);
  assert.ok(r.ok);
  assert.match(r.value.newSource, /id="new"/);
});

test("replaceInSection requires non-empty find", () => {
  const src = `<section id="a" summary="s">x</section>`;
  const h = readSection(src, "a").value.hash;
  const r = replaceInSection(src, "a", "", "y", h);
  assert.ok(!r.ok);
  assert.match(r.error, /'find' must be non-empty/);
});

test("replaceInSection refuses on duplicate match", () => {
  const src = `<section id="a" summary="s">cat dog cat</section>`;
  const h = readSection(src, "a").value.hash;
  const r = replaceInSection(src, "a", "cat", "fox", h);
  assert.ok(!r.ok);
  assert.match(r.error, /matches 2/);
});

test("replaceInSection succeeds on exactly-once match", () => {
  const src = `<section id="a" summary="s">cat dog cat</section>`;
  const h = readSection(src, "a").value.hash;
  const r = replaceInSection(src, "a", "dog", "wolf", h);
  assert.ok(r.ok);
  assert.match(r.value.newSource, /cat wolf cat/);
});

// ── render (regression for reviewer's Medium 1) ─────────────────────────

test("render strips section tags but keeps body", () => {
  const src = `<section id="a" summary="s">body</section>`;
  const { rendered } = render(src);
  assert.equal(rendered.includes("<section"), false);
  assert.equal(rendered.includes("body"), true);
});

test("render strips notes inside sections", () => {
  const src = `<section id="a" summary="s">before<note>private</note>after</section>`;
  const { rendered } = render(src);
  assert.equal(rendered.includes("private"), false);
  assert.match(rendered, /beforeafter/);
});

test("render strips top-level notes too", () => {
  const src = `<note source="user">should not leak</note>
<section id="a" summary="s">body</section>`;
  const { rendered } = render(src);
  assert.equal(rendered.includes("should not leak"), false);
  assert.equal(rendered.includes("body"), true);
});

test("render decodes entity escapes", () => {
  const src = `<section id="a" summary="s">He said &quot;hi&quot; &amp; left.</section>`;
  const { rendered } = render(src);
  assert.match(rendered, /He said "hi" & left\./);
});

test("render preserves inter-section spacing", () => {
  const src = `<section id="a" summary="s">A</section>

<section id="b" summary="s">B</section>`;
  const { rendered } = render(src);
  assert.match(rendered, /A\n\nB/);
});

// ── listNotes ───────────────────────────────────────────────────────────

test("listNotes returns all notes with section attribution", () => {
  const src = `<section id="a" summary="s"><note>a-note</note></section>
<section id="b" summary="s"><note source="user">b-note</note></section>`;
  const { entries } = listNotes(src);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].section, "a");
  assert.equal(entries[1].section, "b");
});

// ── unresolved ──────────────────────────────────────────────────────────

test("unresolved filters to source=user, status=open", () => {
  const src = `<section id="a" summary="s">
<note>agent musing</note>
<note source="user">tighten</note>
<note source="user" status="addressed">already done</note>
<note source="user">also fix this</note>
</section>`;
  const u = unresolved(src);
  assert.equal(u.entries.length, 2);
  assert.deepEqual(u.entries.map((n) => n.content), ["tighten", "also fix this"]);
});

// ── resolveNote ─────────────────────────────────────────────────────────

// Helper: resolve by index, looking up the note's hash from a fresh parse.
function resolveByIndex(src, section, index, status) {
  const note = listNotes(src).entries.filter((n) => n.section === section)[index];
  if (!note) throw new Error(`no note at ${section} #${index}`);
  return resolveNote(src, section, index, note.hash, status);
}

test("resolveNote transitions status and preserves attrs", () => {
  const src = `<section id="a" summary="s"><note source="user" priority="high">tighten</note></section>`;
  const r = resolveByIndex(src, "a", 0, "addressed");
  assert.ok(r.ok);
  assert.match(r.value.newSource, /status="addressed"/);
  assert.match(r.value.newSource, /source="user"/);
  assert.match(r.value.newSource, /priority="high"/);
});

test("resolveNote on plain note defaults source to agent", () => {
  const src = `<section id="a" summary="s"><note>plain</note></section>`;
  const r = resolveByIndex(src, "a", 0, "deferred");
  assert.ok(r.ok);
  const after = listNotes(r.value.newSource).entries[0];
  assert.equal(after.source, "agent");
  assert.equal(after.status, "deferred");
});

test("resolveNote out-of-range refused", () => {
  const src = `<section id="a" summary="s"><note>x</note></section>`;
  const r = resolveNote(src, "a", 5, "deadbeef0000", "addressed");
  assert.ok(!r.ok);
  assert.match(r.error, /out of range/);
});

test("resolveNote operates on the right index when multiple notes", () => {
  const src = `<section id="a" summary="s"><note>first</note><note>second</note><note>third</note></section>`;
  const r = resolveByIndex(src, "a", 1, "addressed");
  assert.ok(r.ok);
  const after = listNotes(r.value.newSource).entries;
  assert.deepEqual(after.map((n) => n.status), ["open", "addressed", "open"]);
});

test("resolveNote on top-level note (empty section id)", () => {
  const src = `<note source="user">global</note>
<section id="a" summary="s">x</section>`;
  const r = resolveByIndex(src, "", 0, "addressed");
  assert.ok(r.ok);
  const after = unresolved(r.value.newSource);
  assert.equal(after.entries.length, 0);
});

test("resolveNote refuses on stale hash (regression: positional misresolution)", () => {
  const src = `<section id="a" summary="s"><note>first</note><note source="user">target</note></section>`;
  // Get hash of the user note (index 1)
  const note = listNotes(src).entries[1];
  const targetHash = note.hash;
  // Now imagine the user inserted a note before it, shifting indices:
  const shifted = src.replace(`<note>first</note>`, `<note>first</note><note>injected</note>`);
  // The targetHash still belongs to the user-note content, but at the same
  // index there's now a different note. resolveNote should refuse.
  const r = resolveNote(shifted, "a", 1, targetHash, "addressed");
  assert.ok(!r.ok);
  assert.match(r.error, /expectedHash mismatch/);
});

test("notes carry hash for resolveNote handle", () => {
  const src = `<section id="a" summary="s"><note>x</note></section>`;
  const note = listNotes(src).entries[0];
  assert.match(note.hash, /^[0-9a-f]{12}$/);
});

// ── parse refuses dangerous mutations on malformed input ───────────────

test("mutations refuse when document has parse errors", () => {
  const src = `</section>some text`;
  // Stray close means errors → no synthetic; mutations should refuse.
  const r = patchSection(src, WHOLE_FILE_ID, "anything", "x");
  assert.ok(!r.ok);
  assert.match(r.error, /parse errors/);
});
