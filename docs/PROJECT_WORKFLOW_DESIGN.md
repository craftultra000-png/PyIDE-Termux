# Project Workflow Design

## Scope

This release adds four phone-first workflows: project-wide search, in-memory open-file tabs, persisted project run settings, and local Python completion. The design preserves the existing security boundary: every filesystem operation remains constrained to the server's allowed roots.

## Project model

A project is the currently selected explorer directory. Its optional hidden `.pyide.json` stores only executable workspace metadata:

```json
{
  "entry": "main.py",
  "args": ["--verbose"],
  "cwd": "."
}
```

`entry` is stored relative to the project root. `cwd` must resolve inside that same root. The server validates all resolved paths before running Python. If no configuration exists, PyIDE continues to run the active Python file with its parent directory as working directory.

## Search model

The project search endpoint walks only the selected project root. It skips dot-prefixed paths, unsupported binary files, and files larger than the editor safety limit. Results carry a safe path, 1-based line number, a short line preview, and a bounded total result count. A tap opens the matching text file and places the editor selection on the matching line.

## Tab model

Tabs exist only in the active browser session. Each tab stores its path, buffer, dirty state, and cursor selection. Changing a tab captures the active buffer before restoring the selected tab. Closing a dirty tab saves it first, preserving the existing no-data-loss policy. Closing the final tab returns to the welcome workspace.

## Completion model

Completion is intentionally local and dependency-free. Suggestions are built from Python keywords, common built-ins, frequently used standard-library imports, and identifiers found in the current buffer. The popup appears after a useful identifier prefix or through Ctrl+Space; it never sends source code to an external service. Arrow keys and Enter select a suggestion; Escape closes it. The small local dictionary is appropriate for mobile devices and remains predictable offline.
