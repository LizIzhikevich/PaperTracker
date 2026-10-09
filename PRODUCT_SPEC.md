# Product Spec: Paper Tracker

## Product Shape

Paper Tracker is a local-first desktop app for researchers who collect more PDFs than they can calmly process. It treats every paper as both a document and a small workflow item: something to triage, read, annotate, summarize, cite, revisit, or archive.

The app is built for macOS and Windows with Electron. All papers and state are stored locally on the user's machine by default.

## Core Jobs

- Add PDFs into a personal paper library.
- Track reading state: `To Read`, `Reading`, `Read`.
- Organize papers into user-created binders such as `USENIX Reviews`, `ML Foundations`, or project-specific reading lists.
- Group binders under `Active` and `Archived` library shelves, then drag binders between those shelves.
- Choose pastel binder colors during creation, then change them from the sidebar context menu.
- Reorder, rename, recolor, and delete binders from the sidebar without deleting their papers.
- Keep notes, tags, priority, rating, venue, year, and deadline per paper.
- Surface the next best reading actions without forcing calendar-style scheduling.
- Let researchers choose conference proceedings to comb, then recommend recent papers using embeddings computed locally from their library metadata.
- Nudge the user about stale papers, weekly reading momentum, and approaching deadlines.

## Interface Direction

The UI borrows the calm density of Motion's calendar app without becoming a calendar clone.

- Left rail: library, Active/Archived binder shelves, search, inline binder creation, and reading activity.
- Library home: standard-width neutral binder spines for Active and Archived sections, followed by a minimal Read Next recommendation.
- Binders show read progress in both the sidebar and the Library home.
- Main canvas: a board for the selected binder, grouped by reading stage.
- Right inspector: selected paper details, notes, metadata, and next action controls.
- Motion: subtle transitions when selecting papers or changing status.
- Tone: quiet, useful, academic, focused.

## Data Model

### Paper

- `id`
- `title`
- `authors`
- `institutions`
- `venue`
- `year`
- `tags`
- `bucketId`
- `status`
- `priority`
- `deadline`
- `rating`
- `localPath`
- `notes`
- `addedAt`
- `updatedAt`
- `lastOpenedAt`
- `finishedAt`

### Discovery

- `venues` — user-added venues explicitly enabled by the user; suggestions come only from venues already in their library.
- `candidates` — normalized recent proceedings metadata and provenance.
- `recommendations` — local similarity score, matched library papers, and deterministic explanation.
- `feedback` — imported and dismissed recommendation IDs.
- `embeddings` — cached local vectors keyed by a content hash and model version.

### Binder

- `id`
- `name`
- `category`
- `color`
- `createdAt`

### Later

- SQLite storage for larger libraries.
- Full-text search over metadata and notes.
- Stronger PDF metadata and first-page text extraction.
- Citation import/export.
- Recurring reminders.
- Optional cloud sync as an explicit opt-in.
- Optional local generative explanations for devices that can run a downloaded chat model.
