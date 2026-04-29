// Tests for the diagnostic layer (Phase 4).

import test from "node:test";
import assert from "node:assert/strict";

import { check, suppress } from "../dist/util/diagnostics.js";

// ── missing_summary ─────────────────────────────────────────────────────

test("flags section without summary attribute", () => {
  const ms = `<section id="a">prose</section>`;
  const r = check(ms, "");
  assert.ok(r.findings.some((f) => f.kind === "missing_summary" && f.section === "a"));
});

test("does not flag section with summary", () => {
  const ms = `<section id="a" summary="x">prose</section>`;
  const r = check(ms, "");
  assert.ok(!r.findings.some((f) => f.kind === "missing_summary"));
});

test("treats empty summary as missing", () => {
  const ms = `<section id="a" summary=" ">prose</section>`;
  const r = check(ms, "");
  assert.ok(r.findings.some((f) => f.kind === "missing_summary"));
});

// ── pacing_outlier ──────────────────────────────────────────────────────

test("does not run pacing with fewer than 3 sections", () => {
  const ms = `<section id="a" summary="s">${"word ".repeat(10)}</section>
<section id="b" summary="s">${"word ".repeat(50)}</section>`;
  const r = check(ms, "");
  assert.ok(!r.findings.some((f) => f.kind === "pacing_outlier"));
});

test("flags ≥2× median as outlier", () => {
  const ms = `<section id="short1" summary="s">${"word ".repeat(10)}</section>
<section id="short2" summary="s">${"word ".repeat(10)}</section>
<section id="long" summary="s">${"word ".repeat(40)}</section>`;
  const r = check(ms, "");
  const outliers = r.findings.filter((f) => f.kind === "pacing_outlier");
  assert.ok(outliers.some((f) => f.section === "long"));
});

test("flags ≤½× median as outlier", () => {
  const ms = `<section id="long1" summary="s">${"word ".repeat(40)}</section>
<section id="long2" summary="s">${"word ".repeat(40)}</section>
<section id="short" summary="s">${"word ".repeat(5)}</section>`;
  const r = check(ms, "");
  const outliers = r.findings.filter((f) => f.kind === "pacing_outlier");
  assert.ok(outliers.some((f) => f.section === "short"));
});

test("does not flag sections close to median", () => {
  const ms = `<section id="a" summary="s">${"word ".repeat(20)}</section>
<section id="b" summary="s">${"word ".repeat(25)}</section>
<section id="c" summary="s">${"word ".repeat(30)}</section>`;
  const r = check(ms, "");
  assert.ok(!r.findings.some((f) => f.kind === "pacing_outlier"));
});

// ── repetition ──────────────────────────────────────────────────────────

test("flags long word appearing ≥5 times", () => {
  const body = "suddenly the door opened. suddenly she gasped. suddenly the lights flickered. suddenly he ran. suddenly nothing.";
  const ms = `<section id="a" summary="s">${body}</section>`;
  const r = check(ms, "");
  const reps = r.findings.filter((f) => f.kind === "repetition");
  assert.ok(reps.some((f) => f.message.includes("suddenly")));
});

test("does not flag short common words", () => {
  const body = "the cat and the dog and the bird and the fish and the mouse and the snake.";
  const ms = `<section id="a" summary="s">${body}</section>`;
  const r = check(ms, "");
  assert.equal(r.findings.filter((f) => f.kind === "repetition").length, 0);
});

test("does not flag pronouns even if long enough", () => {
  // "their" and "those" are 5 chars but should be in stoplist
  const body = "their book, their pen, their chair, their lamp, their desk, their wall.";
  const ms = `<section id="a" summary="s">${body}</section>`;
  const r = check(ms, "");
  assert.ok(!r.findings.some((f) => f.kind === "repetition" && f.message.includes("their")));
});

test("repetition is per-section, not cross-section", () => {
  const body = (w) => `${w} a. ${w} b. ${w} c. ${w} d. ${w} e.`;
  const ms = `<section id="a" summary="s">${body("suddenly")}</section>
<section id="b" summary="s">prose without that word</section>`;
  const r = check(ms, "");
  const reps = r.findings.filter((f) => f.kind === "repetition");
  // Only section a should be flagged
  assert.ok(reps.every((f) => f.section === "a"));
});

test("repetition strips notes from word counts", () => {
  const body = `<note>repeated repeated repeated repeated repeated</note> normal prose here.`;
  const ms = `<section id="a" summary="s">${body}</section>`;
  const r = check(ms, "");
  assert.ok(!r.findings.some((f) => f.kind === "repetition"));
});

// ── stable IDs ──────────────────────────────────────────────────────────

test("finding ids are stable across calls", () => {
  const ms = `<section id="a">prose</section>`;
  const r1 = check(ms, "");
  const r2 = check(ms, "");
  assert.deepEqual(
    r1.findings.map((f) => f.id),
    r2.findings.map((f) => f.id),
  );
});

test("finding id is 12 hex chars", () => {
  const ms = `<section id="a">prose</section>`;
  const r = check(ms, "");
  for (const f of r.findings) assert.match(f.id, /^[0-9a-f]{12}$/);
});

// ── parse-error refusal ────────────────────────────────────────────────

test("refuses on parse errors", () => {
  const r = check(`</section>orphan`, "");
  assert.equal(r.findings.length, 0);
  assert.ok(r.errors.length > 0);
});

// ── suppression integration ─────────────────────────────────────────────

test("suppress adds id to a new ## Suppressed block", () => {
  const r = suppress("", "abcdef012345", "intentional");
  assert.ok(r.ok);
  assert.match(r.value.newMemorySource, /## Suppressed/);
  assert.match(r.value.newMemorySource, /abcdef012345/);
  assert.match(r.value.newMemorySource, /intentional/);
});

test("suppress appends to existing ## Suppressed block", () => {
  const memory = `## Notes\nfoo\n\n## Suppressed\n- aaaaaaaaaaaa — first\n`;
  const r = suppress(memory, "bbbbbbbbbbbb", "second");
  assert.ok(r.ok);
  assert.match(r.value.newMemorySource, /aaaaaaaaaaaa/);
  assert.match(r.value.newMemorySource, /bbbbbbbbbbbb/);
});

test("suppress is idempotent on duplicate id", () => {
  const memory = `## Suppressed\n- aaaaaaaaaaaa — first\n`;
  const r = suppress(memory, "aaaaaaaaaaaa", "different reason");
  assert.ok(r.ok);
  assert.equal(r.value.newMemorySource, memory);
});

test("suppress rejects malformed id", () => {
  const r = suppress("", "not-hex", "reason");
  assert.ok(!r.ok);
});

test("suppress rejects empty reason", () => {
  const r = suppress("", "abcdef012345", "   ");
  assert.ok(!r.ok);
});

test("check filters suppressed findings", () => {
  const ms = `<section id="a">prose</section>`;
  const r1 = check(ms, "");
  const id = r1.findings[0].id;
  const memory = `## Suppressed\n- ${id} — known\n`;
  const r2 = check(ms, memory);
  assert.ok(!r2.findings.some((f) => f.id === id));
});

// ── stable IDs across volatile content (regression for reviewer's High 1) ──

test("pacing finding id is stable across word-count drift", () => {
  const before = `<section id="a" summary="s">${"word ".repeat(10)}</section>
<section id="b" summary="s">${"word ".repeat(10)}</section>
<section id="c" summary="s">${"word ".repeat(40)}</section>`;
  // Same direction (long), different counts and median.
  const after = `<section id="a" summary="s">${"word ".repeat(12)}</section>
<section id="b" summary="s">${"word ".repeat(11)}</section>
<section id="c" summary="s">${"word ".repeat(50)}</section>`;
  const idBefore = check(before, "").findings.find((f) => f.kind === "pacing_outlier" && f.section === "c").id;
  const idAfter = check(after, "").findings.find((f) => f.kind === "pacing_outlier" && f.section === "c").id;
  assert.equal(idBefore, idAfter);
});

test("repetition finding id is stable across count drift", () => {
  const body = (n) => `${"suddenly extra. ".repeat(n)}`;
  const before = `<section id="a" summary="s">${body(5)}</section>`;
  const after = `<section id="a" summary="s">${body(7)}</section>`;
  const idBefore = check(before, "").findings.find((f) => f.message.includes("suddenly")).id;
  const idAfter = check(after, "").findings.find((f) => f.message.includes("suddenly")).id;
  assert.equal(idBefore, idAfter);
});

test("suppression survives word-count drift", () => {
  const before = `<section id="a" summary="s">${"word ".repeat(10)}</section>
<section id="b" summary="s">${"word ".repeat(10)}</section>
<section id="c" summary="s">${"word ".repeat(40)}</section>`;
  const id = check(before, "").findings.find((f) => f.kind === "pacing_outlier").id;
  const memory = `## Suppressed\n- ${id} — chapter is intentionally long\n`;
  // Drift the content
  const after = `<section id="a" summary="s">${"word ".repeat(15)}</section>
<section id="b" summary="s">${"word ".repeat(12)}</section>
<section id="c" summary="s">${"word ".repeat(60)}</section>`;
  const r = check(after, memory);
  assert.ok(!r.findings.some((f) => f.id === id), "suppression should still apply");
});

// ── empty section as pacing outlier (regression for reviewer's Medium) ─

test("zero-word section flagged as short outlier when median > 0", () => {
  const ms = `<section id="real1" summary="s">${"word ".repeat(20)}</section>
<section id="real2" summary="s">${"word ".repeat(20)}</section>
<section id="empty" summary="s"></section>`;
  const r = check(ms, "");
  assert.ok(
    r.findings.some((f) => f.kind === "pacing_outlier" && f.section === "empty"),
    "empty section should appear in findings",
  );
});

test("suppress preserves a following section in memory.md", () => {
  const memory = `## Suppressed\n- aaaaaaaaaaaa — first\n\n## Other\nbody\n`;
  const r = suppress(memory, "bbbbbbbbbbbb", "second");
  assert.ok(r.ok);
  // ## Other section must still be present
  assert.match(r.value.newMemorySource, /## Other\nbody/);
  assert.match(r.value.newMemorySource, /bbbbbbbbbbbb/);
});
