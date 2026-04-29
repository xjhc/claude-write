# claude-write

A minimal writing agent.

## Principles

- Harness = mechanism, prompt = policy, model = judgment. Don't encode agent behavior in harness logic — that's GOFAI.
- The harness is the easy half; the prompt is the hard half. Getting the model to use those mechanisms correctly, at the right times, is the harder problem.
- Models behave differently, so we need to re-test the prompt every time the model changes.
- Use conversation format. LLMs are trained on conversation. Everything the model needs — context, tool results, user guidance, reminders, recoverable errors — is a message in that conversation.
- "Use conversation format" is right, but the hard part is deciding what enters the conversation. This is context engineering. The harness should own retrieval, truncation, salience, recency, and conflict handling.
- Use natural language. Construct the right textual world, let the model think inside it, and capture the result. Make it easy to understand what the agent is doing / thinking, and make it cheap to provide feedback.
- The harness calls the model in a loop. If the response contains tool calls, it executes them, appends results to messages, and calls again. When the model returns no tool calls, the current run is done.
- Never modify agent completions. Raw assistant/tool-call turns are the model's own voice; harness-authored summaries and reminders are separate messages.
- Separation of concerns: the model handles the task, the harness handles infrastructure. Provider failures retry in the harness; recoverable tool errors are returned to the model as messages.
- Selection is exogenous. The harness's job: connect the agent to environments that produce signals (compiler, tests, user feedback) and help the agent apply signals (accumulate skills/memory, surface it on future passes).
- Human feedback should be cheap, especially for weak-feedback domains (e.g. creative writing). The harness should make it easy for the user to provide steer (e.g. summarize findings, recommendations).
- State has ownership. Files, tool outputs, tests, user instructions, and committed memory have different authority. The harness should make those boundaries explicit. When file contents matter, read — don't trust what the model said it wrote (reading is cheap!).

## Design Choices

- Two files only: `manuscript.md` for the artifact, `memory.md` for durable intent, structure, constraints, and open issues. Removes naming decisions and sidecar proliferation.
- Persistent conversation with auto-compact at ~80k tokens. Continuity is task + real user turns + concise pass summaries, not raw tool history. File edits change project state but are not guaranteed conversational memory; summaries keep landed changes visible while raw turns stay in session logs.
- Prompt caching depends on stable prefixes. Anthropic gets explicit breakpoints: cached system, cached tools, stable first message, and rolling last user message. OpenAI-style caching is automatic prefix caching; keep stable content first, rolling context last, and use a stable `prompt_cache_key` where supported.
- One-edit reminder: if a run stops after a single `manuscript.md` edit, inject `<reminder>Revise manuscript.md if useful.</reminder>` and continue. Catches premature idle without adding a revision phase.
- Transparent retries: rate limits and transient failures retry at 2s → 4s → 8s before the model ever sees them.
- Fixed tools: `read`, `write`, `patch`, `list`, `ask`. Minimal but complete.
- Session artifacts per pass: `messages.md`, `messages.json`, `telemetry.json`, `agent.json`. When a run feels wrong, the transcript is more useful than guessing.

## TODO

- `patch()` is exact-match only. Aider uses a fallback chain (exact → whitespace → word-diff → fuzzy) before reporting failure. Large files make reliable anchors hard and mismatches more likely.
- Replay: save enough request metadata to replay a pass exactly against a captured model response.
- Research subagent: `research(prompt)` spawns a read-only subagent and returns only the summary — keeps intermediate reads out of the main conversation.
- Skills: `skills/**/SKILL.md` files with name, description, and body. Inject only names/descriptions into the system prompt; let the agent load skill bodies via `read` when useful.
- Streaming: mainly improves perceived progress; tool calls still need complete JSON before execution.

## What It Does

`claude-write` creates a project directory with:

- `manuscript.md` for the requested artifact
- `memory.md` for durable intent, structure, constraints, and open issues
- `.claude-write/meta.json` for provider, model, and task
- `.claude-write/conversation.json` for model-facing continuity
- `.claude-write/sessions/NNNN/` for per-pass logs

Each `step`:

1. Loads the persisted conversation.
2. Adds `--message` as a user turn if provided.
3. Adds a small user message with `<task>` on the first pass and `<filesystem>` on every pass.
4. Runs the model/tool loop until the model returns no tool calls.
5. If it stopped after exactly one successful `manuscript.md` edit, adds one `<reminder>` and runs the model/tool loop once more.
6. Saves a concise conversation summary plus raw session artifacts.

The harness does not know about chapters, outlines, drafts, style cards, or revision stages. It only fixes the two-file workspace.

## Commands

```sh
npm run build
node dist/cli.js new "write a short book about X" --dir ./my-book --provider openai
node dist/cli.js status --dir ./my-book
node dist/cli.js step --dir ./my-book
node dist/cli.js step --dir ./my-book --message "extend the draft rather than concluding"
```

## Examples

See [`examples/`](examples/) for generated artifacts with their run logs.

- [`examples/violin-fable/`](examples/violin-fable/) shows multi-turn editorial steering: a sparse fable prompt, a reference-shape revision, an explicit LLM afterword, then taste edits.
- [`examples/children-book/`](examples/children-book/) shows a short children's-book artifact from the two-file harness.
- [`examples/didactic-novel/`](examples/didactic-novel/) shows a longer scenario-driven narrative.
- [`examples/book/`](examples/book/) is an alternate didactic-novel run on the same theme.

## Tools

- `read(path, startLine?, endLine?)`: read `manuscript.md` or `memory.md`, optionally by line range.
- `write(path, content)`: replace `manuscript.md` or `memory.md`. Existing files over 8KB cannot be overwritten this way.
- `patch(path, find, replace)`: edit `manuscript.md` or `memory.md`; append when `find` is empty.
- `list()`: list `manuscript.md` and `memory.md`.
- `ask(question)`: ask the user only when input is required for correctness.

The agent cannot read or write outside `manuscript.md` and `memory.md`.

## Session Artifacts

Every pass writes:

- `context.md`: the per-pass user message.
- `messages.md`: readable transcript with system prompt, messages, tool calls, and tool results.
- `messages.json`: exact unredacted message payload for replay/debugging.
- `telemetry.json`: per-turn request sizes and tool-call counts.
- `agent.json`: final text, stop reason, edits, errors, and turn log.

Rule of thumb: use `context.md` for what the agent saw going in, `messages.md` for what happened, `telemetry.json` for cost shape, and `agent.json` for machine-readable summaries.

## Providers

Configured through `.env`:

- `anthropic`
- `azure`
- `openai`

Use `--provider` and `--model` on `new` or `step` to choose a provider/model.
