# Architecture

PyIDE Termux Pro uses a deliberately small local architecture. A Python HTTP server exposes the filesystem and execution APIs, while browser-native ES modules render the mobile interface. The split is designed to make the interface easy to evolve without requiring a Node.js build chain on Android.

```text
┌──────────────────────────────────────────────────────────────────┐
│ Browser UI                                                        │
│ app.js → editor.js / filetree.js / terminal.js                    │
│       → core utilities / reusable UI components                   │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP JSON on localhost
┌───────────────────────────────▼──────────────────────────────────┐
│ Python server                                                     │
│ server.py → route dispatch and static asset serving               │
│ config.py → allowed roots, blocked prefixes, runtime constants    │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│ Handlers                                                          │
│ file_handler.py · python_handler.py · install_handler.py          │
│ terminal_handler.py                                               │
└──────────────────────────────────────────────────────────────────┘
```

| Module | Role | Testability |
|---|---|---|
| `core/path-utils.js` | Joins paths, finds parent paths inside a root, validates a filename segment. | Pure Node test. |
| `core/i18n.js` | Holds locale strings and applies text/direction to the UI. | Translation helper tested directly. |
| `core/api.js` | Minimal JSON API wrapper. | Easy to mock at module boundaries. |
| `components/location-picker.js` | Folder-only destination selection with explicit confirmation. | API and DOM adapters are injected. |
| `components/command-palette.js` | Keyboard-oriented command search and execution. | Commands are supplied by the coordinator. |
| `app.js` | Coordinates state, events, and workflows. | Browser integration verification. |

When adding a new UI feature, put pure logic in `core/`, a reusable interaction in `components/`, and only the wiring in `app.js`. This keeps a mobile-first codebase navigable as it grows.
