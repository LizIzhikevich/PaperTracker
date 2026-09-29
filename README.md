# Paper Tracker

Paper Tracker is a local-first desktop app concept for keeping research PDFs, reading state, notes, priorities, and reminders on a user's own machine.

The first implementation is an Electron app with a focused workflow UI inspired by Motion's calm scheduling surface, adapted into a binder-based paper board instead of a calendar.

## Run

```bash
pnpm install
pnpm run dev
```

Use Node 20 or newer before installing dependencies. This repo includes `.nvmrc` with Node 22 as a good default. The Codex workspace also has a bundled modern Node available at:

```bash
/Users/liz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

## Local Storage

The Electron main process stores app data inside Electron's `userData` directory:

- `library.json` for paper metadata, status, notes, tags, priorities, and dates
- `papers/` for PDFs copied into the local library

The renderer does not directly touch the filesystem. It uses a small preload API, which keeps the storage boundary clearer and makes future upgrades to SQLite straightforward.

PDF import includes a best-effort metadata pass for title, author, venue, year, and tag hints when those fields are present in the file metadata or filename.
