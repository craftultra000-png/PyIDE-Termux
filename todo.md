# Current Fix Checklist

## Foreground launcher with Ctrl+C

- [x] Remove all browser-opening behavior from `pyide`.
- [x] Remove الخلفية وإدارة PID من مسار تشغيل pyide الأساسي.
- [x] Print the local address while keeping the Python server attached to Termux.
- [x] Verify Ctrl+C reaches the foreground Python server and ends pyide cleanly.
- [x] Update tests and instructions, then publish the behavior change.

## Termux launcher and package distribution

- [x] Compare a direct installer plus `pyide` command with a repository-backed `pkg install pyide` package.
- [x] Add a launcher that starts the local server and opens the browser once it is available.
- [x] Provide a safe install or update command for phone-only Termux users.
- [x] Test launcher start, browser opening, and server-reuse behavior.
- [x] Document the chosen installation path and publish it.
- [x] Bind the installed `pyide` command to the exact Git-clone directory used during installation.

## Native input touch handling

- [x] Remove transcript-level pointer focus handling that competes with the native input tap on Android.
- [x] Preserve direct native focus, keyboard opening, and Enter submission on the runtime input.
- [x] Verify tapping the input keeps the phone keyboard open and accepts typing.
- [x] Run regression tests and publish the touch-interaction update.

## Android keyboard loop prevention

- [x] Identify every automatic focus or scrolling action that can retrigger the Android keyboard.
- [x] Restrict automatic focus to a single safe prompt transition.
- [x] Preserve ordinary manual typing and Enter submission without refocusing during input.
- [x] Verify the phone layout does not create a keyboard open/close loop.
- [x] Publish the corrective update.

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
