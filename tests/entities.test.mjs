// Tests for the entity layer (Phase 3).

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseEntities,
  defineEntity,
  findReferences,
  resolveTerms,
} from "../dist/util/entities.js";

// ── parseEntities ───────────────────────────────────────────────────────

test("parseEntities returns one block per ## heading", () => {
  const src = `## Elena
Protagonist.

## Marcus
Antagonist.`;
  const e = parseEntities(src);
  assert.equal(e.length, 2);
  assert.equal(e[0].name, "Elena");
  assert.equal(e[1].name, "Marcus");
});

test("parseEntities extracts aliases line, comma-separated, trimmed", () => {
  const src = `## Elena
aliases: Elena Vasquez, Dr. Vasquez , the archeologist
Protagonist.`;
  const [e] = parseEntities(src);
  assert.deepEqual(e.aliases, ["Elena Vasquez", "Dr. Vasquez", "the archeologist"]);
});

test("parseEntities handles entity with no aliases line", () => {
  const src = `## Marcus
Just the antagonist.`;
  const [e] = parseEntities(src);
  assert.deepEqual(e.aliases, []);
});

test("parseEntities is case-insensitive on the 'aliases:' label", () => {
  const src = `## Elena
ALIASES: Vasquez
Body.`;
  const [e] = parseEntities(src);
  assert.deepEqual(e.aliases, ["Vasquez"]);
});

test("parseEntities ignores headings inside fenced code blocks", () => {
  const src = `## Elena
Body.
\`\`\`
## NotAnEntity
\`\`\`
More body.

## Marcus
Antagonist.`;
  const e = parseEntities(src);
  assert.equal(e.length, 2);
  assert.equal(e[1].name, "Marcus");
});

test("parseEntities only takes the first aliases line", () => {
  const src = `## Elena
aliases: first, set
aliases: second, set
Body.`;
  const [e] = parseEntities(src);
  assert.deepEqual(e.aliases, ["first", "set"]);
});

// ── defineEntity ────────────────────────────────────────────────────────

test("defineEntity returns heading + body", () => {
  const mem = `## Elena
aliases: Vasquez
Protagonist.`;
  const r = defineEntity(mem, "Elena");
  assert.ok(r.ok);
  assert.match(r.value, /^## Elena/);
  assert.match(r.value, /Protagonist\./);
});

test("defineEntity is case-insensitive", () => {
  const mem = `## Elena
Body.`;
  const r = defineEntity(mem, "elena");
  assert.ok(r.ok);
  assert.match(r.value, /^## Elena/); // canonical heading preserved
});

test("defineEntity errors on missing entry", () => {
  const r = defineEntity(`## Other\nBody.`, "Elena");
  assert.ok(!r.ok);
  assert.match(r.error, /no entity entry/);
});

test("defineEntity errors on empty memory", () => {
  const r = defineEntity("", "Elena");
  assert.ok(!r.ok);
});

test("defineEntity errors on empty name", () => {
  const r = defineEntity(`## Elena\nx`, "");
  assert.ok(!r.ok);
});

// ── findReferences: search behavior ─────────────────────────────────────

test("findReferences finds simple word matches", () => {
  const ms = `<section id="opening" summary="s">Elena reads the letter. Elena pauses.</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 2);
  assert.equal(r.value.entries[0].section, "opening");
});

test("findReferences is case-insensitive on the term", () => {
  const ms = `<section id="a" summary="s">elena vs ELENA vs Elena</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 3);
});

test("findReferences honors word boundaries (no substring inside another word)", () => {
  const ms = `<section id="a" summary="s">Elena did not become Elenamood.</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 1);
});

test("findReferences searches multi-word terms with internal punctuation", () => {
  const ms = `<section id="a" summary="s">Dr. Vasquez nodded. Later, Dr. Vasquez left.</section>`;
  const r = findReferences(ms, ["Dr. Vasquez"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 2);
});

test("findReferences returns the matching term in 'matched'", () => {
  const ms = `<section id="a" summary="s">Elena Vasquez and the archeologist.</section>`;
  const r = findReferences(ms, ["Elena Vasquez", "the archeologist"]);
  assert.ok(r.ok);
  const terms = r.value.entries.map((e) => e.matched).sort();
  assert.deepEqual(terms, ["Elena Vasquez", "the archeologist"]);
});

test("findReferences dedups terms case-insensitively", () => {
  const ms = `<section id="a" summary="s">Elena once.</section>`;
  const r = findReferences(ms, ["Elena", "elena", "ELENA"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 1);
});

// ── findReferences: section attribution ─────────────────────────────────

test("findReferences attributes matches to containing section", () => {
  const ms = `<section id="opening" summary="s">Elena starts here.</section>
<section id="climax" summary="s">Elena ends here.</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.deepEqual(
    r.value.entries.map((e) => e.section),
    ["opening", "climax"],
  );
});

test("findReferences attributes top-level prose to empty string", () => {
  const ms = `Elena lives at the top.
<section id="opening" summary="s">other text</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries[0].section, "");
});

test("findReferences uses synthetic id when manuscript has no real sections", () => {
  const ms = "Just plain prose with Elena in it.";
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries[0].section, "__whole_file__");
});

// ── findReferences: ordering and excerpts ───────────────────────────────

test("findReferences sorts by source position", () => {
  const ms = `<section id="a" summary="s">A Marcus then Elena later Marcus again.</section>`;
  const r = findReferences(ms, ["Elena", "Marcus"]);
  assert.ok(r.ok);
  const positions = r.value.entries.map((e) => e.position);
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] >= positions[i - 1], "positions must be non-decreasing");
  }
});

test("findReferences excerpts include surrounding context", () => {
  const filler = "lorem ipsum dolor sit amet, ".repeat(4); // ~110 chars of prose
  const ms = `<section id="a" summary="s">${filler}Elena ${filler}</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  const ex = r.value.entries[0].excerpt;
  assert.match(ex, /Elena/);
  assert.match(ex, /^…/);
  assert.match(ex, /…$/);
});

// ── resolveTerms ────────────────────────────────────────────────────────

test("resolveTerms returns name + aliases when entry exists", () => {
  const mem = `## Elena
aliases: Vasquez, Doctor`;
  const { entity, terms } = resolveTerms(mem, "elena");
  assert.equal(entity?.name, "Elena");
  assert.deepEqual(terms, ["Elena", "Vasquez", "Doctor"]);
});

test("resolveTerms falls back to input name when no entry", () => {
  const { entity, terms } = resolveTerms("", "Elena");
  assert.equal(entity, null);
  assert.deepEqual(terms, ["Elena"]);
});

// ── findReferences: empty / no results ─────────────────────────────────

test("findReferences returns empty entries when no matches", () => {
  const ms = `<section id="a" summary="s">unrelated prose</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 0);
});

// ── markup-aware filtering (regression for reviewer's High 2) ──────────

test("findReferences excludes matches inside section open tags", () => {
  const ms = `<section id="elena-arc" title="Elena chapter" summary="Elena breaks the seal">
prose body without the name.
</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  // No prose match — only attribute matches, which must be filtered.
  assert.equal(r.value.entries.length, 0);
});

test("findReferences excludes matches inside note bodies", () => {
  const ms = `<section id="a" summary="s">
prose without the name.
<note>private agent thought about Elena</note>
more prose.
</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 0);
});

test("findReferences still finds prose matches alongside attribute pollution", () => {
  const ms = `<section id="elena-arc" summary="Elena's chapter">
Elena reads the letter.
</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 1);
  assert.match(r.value.entries[0].excerpt, /Elena reads the letter/);
});

test("findReferences excerpts strip bled-in markup", () => {
  // Match near a section boundary so the ±40 char window includes some tag text.
  const ms = `<section id="a" title="boundary" summary="s">Elena.</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  // No <section ...> or </section> should appear in the excerpt.
  for (const e of r.value.entries) {
    assert.equal(e.excerpt.includes("<section"), false);
    assert.equal(e.excerpt.includes("</section>"), false);
  }
});

// ── excerpt sanitizer (regression for window-opens-mid-note) ──────────

test("excerpt window opening mid-note does not leak note content", () => {
  // Match is right after a note. Pad the note body with content that would
  // be visible if the regex sanitizer can't cut it (no opening <note in slice).
  const sectionBody = `<note source="user">Elena private note that should never appear in any excerpt</note>visible Elena.`;
  const ms = `<section id="a" summary="s">${sectionBody}</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 1, "only the prose match should land");
  // The excerpt for that match must not include the private note text.
  assert.equal(r.value.entries[0].excerpt.includes("private note"), false);
  assert.equal(r.value.entries[0].excerpt.includes("never appear"), false);
});

test("excerpt window closing mid-note does not leak note content", () => {
  const sectionBody = `Elena visible.<note source="user">private note that should never appear</note>`;
  const ms = `<section id="a" summary="s">${sectionBody}</section>`;
  const r = findReferences(ms, ["Elena"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries[0].excerpt.includes("private"), false);
  assert.equal(r.value.entries[0].excerpt.includes("never appear"), false);
});

// ── bidirectional alias lookup (regression for define/references on alias) ──

test("define resolves an alias to its canonical entity", () => {
  const mem = `## Elena
aliases: Dr. Vasquez, the archeologist
Protagonist.`;
  const r = defineEntity(mem, "Dr. Vasquez");
  assert.ok(r.ok);
  assert.match(r.value, /^## Elena/);
});

test("resolveTerms by alias returns canonical name + all aliases", () => {
  const mem = `## Elena
aliases: Dr. Vasquez, the archeologist`;
  const { entity, terms } = resolveTerms(mem, "Dr. Vasquez");
  assert.equal(entity?.name, "Elena");
  assert.deepEqual(terms, ["Elena", "Dr. Vasquez", "the archeologist"]);
});

test("resolveTerms direct name match still wins over alias collision", () => {
  const mem = `## Elena
aliases: Marcus

## Marcus
aliases: nobody`;
  // "Marcus" is both a canonical name and Elena's alias. The canonical
  // entry should win.
  const { entity } = resolveTerms(mem, "Marcus");
  assert.equal(entity?.name, "Marcus");
});

// ── fenced-code aliases (regression for parseEntities ignoring fences) ─

test("parseEntities ignores aliases line inside fenced code blocks", () => {
  const mem = `## Elena
Body.
\`\`\`
aliases: should, not, count
\`\`\`
More body.`;
  const [e] = parseEntities(mem);
  assert.deepEqual(e.aliases, []);
});

test("parseEntities still finds aliases line outside fences when fence is present", () => {
  const mem = `## Elena
aliases: real, aliases
\`\`\`
some code
\`\`\`
More.`;
  const [e] = parseEntities(mem);
  assert.deepEqual(e.aliases, ["real", "aliases"]);
});

// ── overlap dedup (regression for canonical+alias double counting) ────

test("overlapping alias hits are deduped by longest match", () => {
  const ms = `<section id="a" summary="s">Elena Vasquez arrived.</section>`;
  // "Elena" and "Elena Vasquez" both match the same span; only one hit
  // should be reported, with the longer term winning.
  const r = findReferences(ms, ["Elena", "Elena Vasquez"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 1);
  assert.equal(r.value.entries[0].matched, "Elena Vasquez");
});

test("non-overlapping hits across terms are all kept", () => {
  const ms = `<section id="a" summary="s">Elena spoke. Later, Vasquez nodded.</section>`;
  const r = findReferences(ms, ["Elena", "Vasquez"]);
  assert.ok(r.ok);
  assert.equal(r.value.entries.length, 2);
});

test("standalone Elena and full Elena Vasquez are counted separately", () => {
  const ms = `<section id="a" summary="s">Elena alone here. Then Elena Vasquez later.</section>`;
  const r = findReferences(ms, ["Elena", "Elena Vasquez"]);
  assert.ok(r.ok);
  // Two hits: one for standalone "Elena", one for "Elena Vasquez" (which
  // absorbs the inner "Elena" by overlap rule).
  assert.equal(r.value.entries.length, 2);
  const matchedTerms = r.value.entries.map((e) => e.matched).sort();
  assert.deepEqual(matchedTerms, ["Elena", "Elena Vasquez"]);
});

test("findReferences errors on empty term list", () => {
  const r = findReferences("anything", [""]);
  assert.ok(!r.ok);
});
