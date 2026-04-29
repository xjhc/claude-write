# Design: An IDE for Writing

Forward-looking design. The README captures what's settled (two-file harness, conversation format, minimal tools). This captures the direction we're heading: an IDE-shaped surface for the writing agent.

## Goal

Give the agent IDE-shaped abstractions over prose — outline view, jump-to-section, surgical edit, lint, refactor. Today the agent reads the whole manuscript or guesses line ranges. We want it to navigate and manipulate the document structurally, with the same leverage a developer gets from PyCharm or Cursor on a codebase.

This is *not* annotation tooling. The load-bearing pieces are spatial understanding, semantic indexing, diagnostics, and refactoring. Annotations are a small extra.

## Principle: text-native, not GUI-native

Code IDEs are GUI-forward because human eyes parse spatial layouts fast. LLMs don't have eyes; they have attention over tokens. An IDE for an agent is not a downgraded GUI — it's a different surface natively suited to how the model perceives:

- **Tool calls in, structured text out.** No visual layouts.
- **Numbers and lists, not bar charts.** A list of word counts is more legible to an LLM than a rendered minimap.
- **Don't ASCII-art visual encodings.** They waste tokens and add no information.
- **Affordances that depend on clicking become tool calls.** "Hover for definition" → `define(name)`.
- **Use the bandwidth.** A prose lint can be a paragraph, not a tooltip; a refactor preview can include intent alongside the diff.

## Two operators

A writing IDE has two operators: the agent and the human. They share primitives but render differently:

- **Agent IDE**: tool calls and structured text responses. Subject of this document.
- **Human IDE**: GUI-forward, optional, layered on the same primitives later.

Build the agent IDE first.

## Layers

Five layers, each building on the last. The structural layer is the MVP; others are additive.

### 1. Structural layer (foundation)

Addressable units of prose. Without this, nothing else is possible.

#### Markup

The artifact is opaque text — whatever form fits the work (poem, screenplay, prose, page-by-page). The harness imposes no format on the prose itself. Two XML-shaped tags ride on top:

- `<section id="..." title="..." summary="...">...</section>` — addressable units.
- `<note source="agent|user" status="open|addressed|deferred">...</note>` — annotations.

Section attributes:
- `id` (required) — stable slug, the lookup key. Persists across rename.
- `title` (optional) — display label. Cosmetic; can change without breaking references.
- `summary` (optional but expected) — one-line content abstract. Powers `outline()`.

Note attributes:
- `source` — `agent` (default) or `user`. The user's are picked up via `unresolved()`.
- `status` — `open` (default), `addressed`, or `deferred`. Status transitions are explicit so the audit trail survives; deletion is allowed but loses provenance.

#### Reserved markup

Only `<section>` and `<note>` are reserved. Anything else — `<foo>`, screenplay sluglines, HTML the agent quotes — passes through verbatim as prose.

Reserved tags must be well-formed: matched open and close, attributes in `name="value"` form. Inside attribute values, the quote character must be escaped (`&quot;`). Inside prose, the only literal sequences to avoid are `</section>` and `</note>` themselves; if they need to appear (e.g., as quoted text about the format), escape them as `&lt;/section&gt;` and `&lt;/note&gt;`.

The harness validates reserved markup on every read. It does not enforce universal entity escaping of `<`, `>`, `&` in prose — that would impose ceremony on artifact forms that don't need it (poems, screenplays, plain prose).

Malformed reserved markup (unclosed `<section>`, stray `</section>`, unquoted attribute, etc.) does not crash. The parser returns diagnostics and refuses any structural mutation while the document is malformed. Reads still work and surface the problem.

#### Bootstrapping unsectioned manuscripts

Existing manuscripts (and new ones the agent hasn't sectioned) are valid. The parser treats an unsectioned file as a single synthetic section with id `__whole_file__`. `outline()` returns one entry; `read_section("__whole_file__")` returns the entire file.

`__whole_file__` is never written to disk as a real `<section>` tag. The agent converts to real sections by calling `patch_section("__whole_file__", newContent, expectedHash)` where `newContent` contains real `<section>` tags. The synthetic id is the only way to address an unsectioned manuscript through the structural tools; once any real section exists, the synthetic id stops applying.

Top-level notes in a sectioned manuscript (a `<note>` outside any `<section>`) are valid. They are listed by `notes()` / `unresolved()` with empty-string section attribution and stripped by `render()`. Use `resolve_note("", index, expectedHash, status)` for them — the hash precondition still applies.

#### Operations

```ts
outline(): Array<{ id: string; title?: string; summary?: string; words: number; hash: string }>
read_section(id: string): { content: string; hash: string }
patch_section(id: string, content: string, expectedHash: string): { hash: string }
replace_in_section(id: string, find: string, replace: string, expectedHash: string): { hash: string }
render(): string  // manuscript only; strips reserved tags, preserves body and spacing
notes(): Array<{ section: string; source: "agent" | "user"; status: string; content: string }>
```

Mutation safety:
- All mutating section ops require `expectedHash`. The harness compares it to the current section hash and refuses on mismatch (the agent is editing stale content). The new hash is returned so the agent can chain edits.
- `replace_in_section` must match `find` *exactly once* inside the named section. Zero matches → error. Multiple matches → error with a count. Use `patch_section` for whole-section rewrites.

Render rules:
- Strips `<section>` open/close tags, `<note>` blocks (all sources, all statuses), and entity escapes.
- Preserves body text and inter-section spacing exactly.
- Does *not* emit `## Title` or any Markdown structure. Title emission would impose Markdown on poems, scripts, and page prose. If a future renderer wants titled output, it goes through a separate option, not the default.

#### Why this shape

- **XML over Markdown structure.** Markdown headings work for nonfiction prose but break for poetry, screenplays, page-by-page books. XML wraps any prose form.
- **One annotation tag, not many.** `<note source=...>` covers both agent and user notes; promote a typed tag only when real runs show repeated patterns.
- **Inline, not sidecar.** Sidecar annotations rot when prose changes. Inline tags travel with the prose.
- **`id` separate from `title` and `summary`.** Three roles, three fields. Conflating them breaks rename.
- **Hashes, not optimistic writes.** The agent works in long sessions; the file may have moved between reads. `expectedHash` makes stale-state edits visible instead of silent.

### 2. Steering layer

Cheap human-in-loop. Depends only on the structural layer; ship it second.

#### Convention

The user (or the agent) leaves `<note source="user">tighten this</note>` anywhere in the manuscript. Status starts `open`. The agent picks them up next pass.

#### Operations

```ts
unresolved(): Array<{ section: string; index: number; hash: string; content: string }>
resolve_note(section: string, index: number, expectedHash: string, status: "addressed" | "deferred"): void
```

The agent's punch list. Calling `unresolved()` at the start of a pass tells it where the user wants attention. After acting, it transitions status to `addressed` (or `deferred` with a reason). The `expectedHash` precondition refuses on stale state — if notes shifted between `unresolved()` and `resolve_note()`, the call is rejected rather than silently resolving the wrong note. Status preserves audit trail; deletion is allowed but discouraged.

### 3. Entity layer

Semantic indexing. Go-to-definition for prose: characters, places, themes, motifs.

#### Convention

memory.md is already Markdown. Entity entries are headings with optional aliases:

```md
## Elena
aliases: Elena Vasquez, Dr. Vasquez, the archeologist
Protagonist. Sister of Marcus. Introduced in opening.

## Marcus
Antagonist. Elena's brother. Sealed the tomb.

## Grief (theme)
aliases: mourning, loss
Introduced opening; resurfaces midpoint, climax.
```

Aliases are names, nicknames, titles, and distinctive phrases. Not pronouns. Pronoun/coreference resolution is a future LLM-driven extension; including pronouns in aliases would make `references()` too noisy to be useful.

#### Operations

```ts
references(name: string): Array<{ section: string; excerpt: string; matched: string }>
define(name: string): string  // returns the matching `## Name` block from memory.md
```

`references` greps for the canonical name + any declared aliases, returns matches grouped by section. `matched` records which alias hit so the agent can spot alias drift.

`rename_entity` (refactor layer) reuses the alias index — without it, rename would miss nicknames.

### 4. Diagnostic layer

Lint, but for prose. LLM-cheap to compute and absent from existing tools.

#### Categories

- **Continuity:** "blue eyes" in chapter 2, "brown" in chapter 9.
- **Outline drift:** the section's `summary` no longer matches its prose.
- **POV / tense consistency:** drift from declared POV/tense.
- **Repetition:** overused words within or across sections.
- **Pacing:** word-count outliers among sections.
- **Dangling promises:** Chekhov's gun introduced and never resolved.

#### Operations

```ts
check(scope?: string): Array<Finding>
// Finding: { id, kind, section, message, suggestion? }
suppress(findingId: string, reason: string): void
```

Each finding has a stable `id` derived from `hash(kind + section + canonicalized_message)`. The same problem produces the same id across passes, so the agent can track what it has and hasn't addressed.

Suppressions live in memory.md as a `## Suppressed` block listing finding ids with rationale. `check()` filters them out. This lets the user say "ignore this continuity warning" durably.

### 5. Refactoring layer

Beyond `patch_section` — structural and semantic edits writers don't have reliable tools for today.

#### Operations

```ts
// Structural
move_section(id: string, before?: string, after?: string): void
split_section(id: string, at: string, new_id: string): void
merge_sections(a: string, b: string, into: string): void
rename_section_id(old: string, new_id: string): { references_updated: number }

// Semantic (LLM-driven)
rename_entity(old: string, new_name: string): { changed: number }
change_pov(target: "first" | "third"): { changed: number }
change_tense(target: "past" | "present"): { changed: number }
```

`rename_entity` is the killer app — find/replace handles `Elena → Marisol` poorly because pronouns, possessives, and nicknames need contextual handling. With the LLM in the loop and the alias index from the entity layer, all of these become tractable.

Each semantic refactor returns a count of changed locations and (later) a diff before commit.

## Phasing

Each phase shippable on its own:

1. **Structural.** `<section>`, `<note>`, parser + validation, `outline`, `read_section`, `patch_section`, `replace_in_section`, `render`, `notes`. Foundation. Includes `__whole_file__` migration path.
2. **Steering.** `<note source="user">` + `unresolved()` + `resolve_note()`. Cheap and high-leverage.
3. **Entity.** memory.md `## Name` + aliases convention + `references` / `define`. Pays off on long manuscripts.
4. **Diagnostics.** `check()` with stable finding ids and `suppress()`. The "IDE feel" inflection point.
5. **Refactoring.** `move_section`, `rename_entity`, `change_pov`, etc. The differentiator.

## What it retires

- The `patch()` exact-match-only TODO. `patch_section` is anchor-free and hash-preconditioned.
- Brittle line-range reads. `read_section` is id-addressed.
- The agent's habit of full-file reads. `outline()` becomes the default first move — the prompt has to make it the habit.

## Prompt implications

The agent prompt has to teach the new defaults:

- Use `outline()` before reading. Read sections by id, not the whole file.
- Maintain `summary` as you edit. Stale summaries make `outline()` lie.
- Address `unresolved()` at the start of every pass.
- For long manuscripts, maintain `## Name` entries (with aliases) in memory.md.

The harness gives the option; the prompt has to make these the habit.

## Status

Proposed. Phase 1 is the immediate implementation target. Everything else lands as the foundation proves out.
