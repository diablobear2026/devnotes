# DevNotes

A local-first knowledge manager built for developers.

---

## About

DevNotes is a desktop app that helps developers organize the information they accumulate every day — commands, URLs, API keys, config snippets, and plain notes — grouped by **project**. Just paste anything; it figures out the category automatically.

Everything stays on your machine. No account, no sync, no network required.

---

## Features

- **Multi-project workspace** — create as many projects as you need; each one is fully isolated
- **Tabs per project** — open multiple named tabs inside any project
- **Auto-categorization** — content is classified the moment you paste it
- **Syntax highlighting** — bash/shell, JSON, YAML, and .env formats
- **Full-text search** — search across all projects and tabs at once
- **Dark glassmorphism UI** — easy on the eyes during long sessions
- **100% local** — no internet connection, no account, no telemetry

### Auto-classification Rules

| Type | Detected when… |
|------|----------------|
| `cmd` | starts with `$` / `#`, or contains bash keywords |
| `url` | HTTP/HTTPS URL, or `host:port` pattern |
| `secret` | API key, token, password, email address, phone number |
| `config` | key-value pair or environment variable (`KEY=value`) |
| `note` | anything else |

Once you manually change a category, it is **permanently locked** — auto-classification will no longer touch that entry.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Desktop shell | [Tauri 2](https://tauri.app) + Rust |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Editor / highlighting | CodeMirror 6 |
| Storage | Local JSON files via Tauri fs API |

---

## Getting Started

**Prerequisites**

- [Rust](https://www.rust-lang.org/tools/install)
- Node.js ≥ 18
- macOS (the only supported platform at the moment)

```bash
# Install dependencies
npm install

# Start in dev mode
npm run tauri:dev

# Type check
npm run typecheck

# Run unit tests
npm test

# Production build
npm run tauri:build
```

Build output:
- `.app` → `src-tauri/target/release/bundle/macos/DevNotes.app`
- `.dmg` → `src-tauri/target/release/bundle/dmg/DevNotes_0.1.0_aarch64.dmg`

---

## License

MIT
