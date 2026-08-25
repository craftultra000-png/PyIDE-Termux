# Current Fix Checklist

## Focus recovery and toolbar cleanup

- [x] Identify and remove the duplicated terminal-looking toolbar action while preserving command shortcuts.
- [x] Ensure the live Python input receives and retains focus after output is rendered.
- [x] Make the execution transcript itself focusable as a reliable Android tap fallback.
- [x] Verify sequential Python input after an initial printed prompt on phone and desktop layouts.
- [x] Publish the corrective update.

- [x] Reproduce and diagnose live Python input behavior on Android-style keyboard events.
- [x] Disable automatic capitalization, correction, and sentence-mode keyboard hints for terminal and Python input.
- [x] Redesign Execution as a full-height, edge-to-edge workspace on phones.
- [x] Redesign Terminal as a full-height, edge-to-edge workspace on phones.
- [x] Keep editable input directly in the transcript with a visible terminal-like cursor/prompt.
- [x] Verify Python `input()` accepts sequential values on desktop and phone layouts.
- [x] Verify terminal commands accept ordinary typing and Enter on desktop and phone layouts.
- [x] Publish the fix to GitHub.
