# PaperTracker

PaperTracker is a local-first desktop app for organizing research papers, tracking reading progress, and keeping a private searchable library on your own computer.

It is built with Electron for macOS and Windows. PDFs, notes, reading status, metadata, and app state are stored locally by default.

## Download The App

The goal is for most people to install PaperTracker from the GitHub Releases page:

[Download PaperTracker from GitHub Releases](https://github.com/LizIzhikevich/PaperTracker/releases)

Choose the file for your operating system:

- **macOS:** download the `.dmg`, open it, then drag `PaperTracker` into Applications.
- **Windows:** download the `.exe` installer and open it.

If there are no release files yet, the app has not been packaged for public download yet. In that case, use the developer setup below for now.

### About Security Warnings

Early PaperTracker builds may be unsigned. That means macOS Gatekeeper or Windows SmartScreen may warn that the app is from an unidentified developer.

This does not mean the app is unsafe, but it does mean the installer has not yet been code-signed. A fully polished one-click installer will eventually require:

- Apple Developer ID signing and notarization for macOS.
- Windows code-signing certificate for Windows.

Until then, GitHub Releases can still provide downloadable installers, but users may need to approve the app manually the first time they open it.

## What PaperTracker Does

- Stores research PDFs locally.
- Organizes papers into binders.
- Tracks reading status: `To Read`, `Reading`, and `Read`.
- Shows reading progress by binder.
- Extracts paper metadata where possible.
- Extracts abstracts for search, without displaying them by default.
- Shows paper cards with Figure 1 thumbnails when detectable.
- Shows a first-page preview that opens the PDF.
- Keeps notes and metadata private on the user's machine.

## Where Data Is Stored

PaperTracker stores app data inside Electron's `userData` directory.

On macOS this is typically:

```text
~/Library/Application Support/paper-tracker/
```

Important files/folders:

- `library.json`: paper metadata, status, notes, tags, priorities, dates, and binders
- `papers/`: PDFs copied into the local library
- `thumbnails/`: generated first-page previews and Figure 1 thumbnails

PaperTracker does not currently sync data to a server.

## Developer Setup

Use Node 20 or newer. This repo includes `.nvmrc` with Node 22 as a good default.

Install dependencies:

```bash
pnpm install
```

Run the app locally:

```bash
pnpm run dev
```

Run syntax checks:

```bash
pnpm run check
```

## Build Installers Locally

Build for the current platform:

```bash
pnpm run dist
```

Build macOS artifacts:

```bash
pnpm run dist:mac
```

Build Windows artifacts:

```bash
pnpm run dist:win
```

Build outputs are written to:

```text
release/
```

## Publishing A GitHub Release

This repo includes a GitHub Actions workflow that can build desktop installers.

To create a downloadable release:

1. Update the version in `package.json`.
2. Commit the version change.
3. Create and push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will build macOS and Windows installers and attach them to a draft GitHub Release.

After the workflow finishes:

1. Open the repository's Releases page.
2. Review the draft release.
3. Publish it when ready.

## License

Apache-2.0
