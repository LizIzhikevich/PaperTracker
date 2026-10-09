# PaperTracker

PaperTracker is a desktop app for organizing research papers and tracking reading progress.

## Local Discovery

PaperTracker can comb recent proceedings from selected venues and rank papers against the user's local library. The first refresh downloads an Apache-licensed MiniLM embedding model to the app's local data folder. The model runs on-device: no LLM API key, paid inference account, PDF upload, or library sync is required. Proceedings metadata is fetched from OpenAlex when the user chooses to refresh.

## Download The App

The goal is for most people to install PaperTracker from the GitHub Releases page:

[Download PaperTracker from GitHub Releases](https://github.com/LizIzhikevich/PaperTracker/releases)

Choose the file for your operating system:

- **macOS:** download the `.dmg`, open it, then drag `PaperTracker` into Applications.
- **Windows:** download the `.exe` installer and open it.

## Build a macOS installer

Create a fresh installable `PaperTracker.dmg` (with the PaperTracker app icon) from the project folder:

```bash
pnpm run package:mac
```

The generated `.dmg` and `.zip` are placed in `release/`. Open the `.dmg`, drag PaperTracker to Applications, then launch it from Spotlight or the Dock. During development, stop the running app with `Control-C` in its terminal before rebuilding or relaunching it.
