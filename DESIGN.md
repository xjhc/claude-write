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
- **Use the bandwidth.** A prose lint can be a paragraph, not a tooltip; a refactor preview can include intent alongside the diff. LLMs can produce and consume rich natural language directly.

## Two operators

A writing IDE has two operators: the agent and the human. They share primitives — outline, entity index, diagnostics, refactor ops — but render differently:

- **Agent IDE**: tool calls and structured text responses. Subject of this document.
- **Human IDE**: GUI-forward, optional, layered on the same primitives later.

Build the agent IDE first. The human IDE is a frontend over the same data.

## Layers

Five layers, each building on the last. The structural layer is the MVP; others are additive.

### 1. Structural layer (foundation)

Addressable units of prose. Without this, nothing else is possible.

#### Markup

The artifact is opaque text — whatever form fits the work (poem, screenplay, prose, page-by-page). The harness imposes no format on the prose itself. Two XML-shaped tags ride on top:

- `<section name="..." summary="...">...</section>` — addressable units. The agent picks the unit per-artifact (stanza, scene, page, chapter).
- `<note>...</note>` — inline annotations the agent leaves for future passes. Optional.

Section names are stable IDs. Summaries make `outline()` carry meaning instead of just being a TOC of names.

#### Operations

```ts
outline(): Array<{ name: string; summary: string; words: number }>
read_section(name: string): string
patch_section(name: string, content: string): void
render(path: "manuscript" | "memory"): string  // XML stripped
notes(): Array<{ section: string; content: string }>
```

`outline()` is the agent's mental map — the cheap structural read. `patch_section` is surgical replace, no anchor matching, no exact-match fragility. `render` is the publish step.

#### Why this shape

- **XML over Markdown structure.** Markdown headings work for nonfiction prose but break for poetry, screenplays, page-by-page books. XML wraps any prose form and stays parseable.
- **One annotation tag, not many.** Don't pre-design `<question>`, `<scaffold>`, etc. Promote a tag only when real runs show repeated content patterns.
- **Inline, not sidecar.** Sidecar annotations rot when prose changes (anchor drift). Inline tags travel with the prose.
- **Summary as attribute, not first-line convention.** Explicit is parseable; convention forces the agent to reason about boundaries.
- **The `.md` extension on `manuscript.md` is a soft commitment we may want to drop.** The artifact form is the agent's call.

### 2. Steering layer

Cheap human-in-loop. Depends only on the structural layer; ship it second.

#### Convention

The user leaves `<user-note>tighten this</user-note>` anywhere in the manuscript. The agent picks it up next pass and addresses it.

#### Operations

```ts
unresolved(): Array<{ section: string; content: string }>
```

The agent's punch list. Calling `unresolved()` at the start of a pass tells it where the user wants attention.

This is the highest-leverage human-in-loop primitive: the user opens the file, scatters notes in plain English, saves, runs `step`. The agent does the rest.

### 3. Entity layer

Semantic indexing. Go-to-definition for prose: characters, places, themes, motifs.

#### Convention

memory.md is already Markdown by convention. Entity entries live there as headings:

```md
## Elena
Protagonist. Sister of Marcus. Archeologist. Introduced in opening.

## Marcus
Antagonist. Elena's brother. Sealed the tomb.

## Grief (theme)
Introduced opening; resurfaces midpoint, climax.
```

No new tags inside the manuscript. Entries are plain headings + prose, in the form the agent already writes.

#### Operations

```ts
references(name: string): Array<{ section: string; excerpt: string }>
define(name: string): string  // returns the matching `## Name` block from memory.md
```

`references` is grep with section context. `define` is hover-for-bio. The agent maintains the `## Name` blocks; the harness reads them.

Long manuscripts where re-reading is expensive get the most leverage from this layer.

### 4. Diagnostic layer

Lint, but for prose. The most underdeveloped frontier in writing tools and LLM-cheap to compute.

#### Categories

- **Continuity:** "blue eyes" in chapter 2, "brown" in chapter 9.
- **Outline drift:** the section's `summary` attribute no longer matches its prose.
- **POV / tense consistency:** drift from declared POV/tense.
- **Repetition:** overused words within or across sections.
- **Pacing:** word-count outliers among sections.
- **Dangling promises:** Chekhov's gun introduced and never resolved.

#### Operations

```ts
check(scope?: string): Array<Finding>
// Finding: { kind, location, message, suggestion? }
```

Returned as a structured list. The agent is expected to act on findings, not just see them.

Diagnostics is the layer where the IDE *feels* like an IDE — there are signals, and the agent has work it can do without being asked.

### 5. Refactoring layer

Beyond `patch_section` — structural and semantic edits writers don't have reliable tools for today.

#### Operations

```ts
// Structural
move_section(name: string, before?: string, after?: string): void
split_section(name: string, at: string, new_name: string): void
merge_sections(a: string, b: string, into: string): void
rename_section(old: string, new_name: string): void

// Semantic (LLM-driven)
rename_entity(old: string, new_name: string): { changed: number }
change_pov(target: "first" | "third"): { changed: number }
change_tense(target: "past" | "present"): { changed: number }
```

`rename_entity` is the killer app — find/replace handles `Elena → Marisol` poorly because pronouns, possessives, and nicknames need contextual handling. With the LLM in the loop, all of these become tractable.

Each semantic refactor returns a count of changed locations and (later) a diff before commit.

## Phasing

Each phase shippable on its own:

1. **Structural.** `<section>`, `<note>`, `outline`, `read_section`, `patch_section`, `render`, `notes`. Foundation.
2. **Steering.** `<user-note>` + `unresolved()`. Cheap and high-leverage; depends only on the structural layer.
3. **Entity.** memory.md `## Name` convention + `references` / `define`. Pays off on long manuscripts.
4. **Diagnostics.** `check()` with the categories above. The "IDE feel" inflection point.
5. **Refactoring.** `move_section`, `rename_entity`, `change_pov`, etc. The differentiator.

## What it retires

- The `patch()` exact-match-only TODO. `patch_section` is anchor-free.
- Brittle line-range reads. `read_section` is name-addressed.
- The agent's habit of full-file reads. `outline()` becomes the default first move — the prompt has to make it the habit.

## Prompt implications

The agent prompt has to teach the new defaults:

- Use `outline()` before reading. Read sections by name, not the whole file.
- Maintain `summary` as you edit. Stale summaries make `outline()` lie.
- Address `unresolved()` at the start of every pass.
- For long manuscripts, maintain `## Name` entries in memory.md so `define()` and `references()` stay useful.

The harness gives the option; the prompt has to make these the habit.

## Status

Proposed. The structural and steering layers are the immediate next implementation targets. Everything else lands as the foundation proves out.
