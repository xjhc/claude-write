# examples

Generated artifacts from `claude-write` runs.

Current examples:

- `violin-fable/`: compact multi-turn example. Starts from a sparse fable prompt, then uses later turns for reference shape, conceptual afterword, and taste edits about what LLMs are good at.
- `children-book/`: short, high-quality children's-book example using the current two-file harness and one-edit reminder.
- `didactic-novel/`: longer workplace-fiction example using the current two-file harness and one-edit reminder.
- `book/`: alternate didactic-novel run on the same theme — useful for comparing two independent generations from a similar prompt.

Each example includes:

- `manuscript.md`: generated artifact
- `memory.md`: durable editorial state
- `.claude-write/`: run metadata and session logs
