# Current Fix Checklist

## Kebab menu and quick Python commands

- [x] Replace the PyIDE Termux header wordmark with a Kebab menu and keep Run beside it.
- [x] Move shortcuts, new file, save, Terminal, and Settings into the Kebab menu.
- [x] Add a dedicated quick-Python page that executes one entered line when Enter is pressed.
- [x] Add an explicit disconnect action below Settings that closes the active Python command session.
- [x] Verify the menu, quick commands, and disconnect flow on desktop and phone, then publish.

## Phone toolbar, input size, and Quick Python keyboard recovery

- [x] Move Run and Kebab to the marked phone-toolbar positions and keep the remaining space clear.
- [x] Match Execution and Quick Python input typography to the normal terminal text size.
- [x] Restore native Quick Python input focus when the user taps its prompt after dismissing the phone keyboard.
- [x] Verify the toolbar, font size, and keyboard recovery on desktop and phone, then publish.

## Console typography and keyboard focus follow-up

- [x] Remove the remaining mismatch between typed text and executed transcript text in Terminal and Quick Python.
- [x] Prevent the mobile keyboard from immediately closing after a blank-area tap in Terminal and Quick Python.
- [x] Move the Files hamburger button to the opposite end of the phone toolbar.
- [x] Verify keyboard recovery, console typography, and the hamburger position on desktop and phone, then publish.

## Terminal font-size setting follow-up

- [x] Restore immediate application of the terminal font-size slider to Terminal and Quick Python outputs and inputs.
- [x] Verify that changing the slider changes both transcript and editable prompt together on desktop and phone.
- [x] Run regressions, document the result, and publish the verified fix.

## Compact Acode-inspired Kebab menu

- [x] Reduce the Kebab menu footprint and row density while keeping every current command available.
- [x] Align its spacing, typography, icons, and dividers with the compact Acode-style reference.
- [x] Verify the menu on desktop and phone, run regressions, and publish the verified update.

## Acode menu structure and active-file header

- [x] Rebuild the Kebab menu hierarchy, section dividers, row rhythm, and icon alignment to follow the supplied Acode reference.
- [x] Show the currently open filename beside the Files hamburger in the top bar without crowding phone controls.
- [x] Verify the menu and filename treatment on desktop and a 390 px phone viewport, then publish the update.

## Contextual tool headers and compact phone menu

- [x] Remove the active-file label collision with the Files hamburger and retain a single compact contextual title in the phone toolbar.
- [x] Reduce the Kebab popup footprint while preserving a readable Acode-style grouping and full command access.
- [x] Replace the large page headers in Execution, Terminal, and Quick Python with compact contextual tool headers and maximize the usable transcript/workspace area.
- [x] Hide Run outside the editor and show the current tool name beside Files when Execution, Terminal, or Quick Python is active.
- [x] Verify desktop and 390 px phone layouts, interactions, and regressions, then publish the update.

## Terminal package commands and Acode-style settings

- [x] Pass full shell commands such as `pip install matplotlib` and `pkg install <package>` to Terminal without treating the complete command as one package name.
- [x] Remove the fixed 30-second Terminal command timeout while keeping the editor responsive during long-running commands.
- [x] Replace the card-based Settings landing page with a grouped Acode-style settings list.
- [x] Remove direct library-install controls and add a read-only installed-libraries page with clear Terminal installation guidance.
- [x] Verify Terminal installation commands, Settings, and the library page on desktop and a 390 px phone viewport, then publish the update.

## Live Terminal output and Matplotlib installation guidance

- [x] Stream Terminal stdout and stderr while a long-running command is still active instead of returning output only when the command exits.
- [x] Preserve a safe way to stop an active Terminal command when the user leaves the Terminal page or explicitly interrupts it.
- [x] Verify the Termux-supported Matplotlib package path and update the library guidance with the correct command.
- [x] Test live Terminal output on desktop and a 390 px phone viewport, run regressions, and publish the verified fix.

## Safe file previews and inline execution charts

- [x] Classify text, image, and binary or unknown files before opening them, preventing large binary content from entering the editor.
- [x] Add an image viewer inside the PyIDE workspace with a safe return path to the file list or editor.
- [x] Detect new image artifacts written by a running Python file and render them inline in Execution, starting with Matplotlib `savefig()` output.
- [x] Keep the artifact flow generic for image-producing libraries rather than binding it only to Matplotlib.
- [x] Verify text files, images, ZIP or unknown binaries, and generated charts on desktop and a 390 px phone viewport, then publish the update.

## Execution input focus recovery

- [x] Restore reliable Android keyboard input when a running Python file reaches `input()` in Execution.
- [x] Prevent focus recovery from causing an open/close loop or stealing normal user focus.
- [x] Verify Python input on desktop and phone, run regressions, and publish the verified fix.

## Long-running execution diagnosis

- [x] Trace how Python-session return codes and termination signals are produced.
- [x] Check whether PyIDE has an explicit timeout or kill path for long-running jobs.
- [x] Improve user-visible diagnostics for forced process termination if appropriate.
- [x] Test a long-running session and publish the verified fix.

## Unlimited execution-session lifecycle

- [x] Remove the fixed timeout from interactive Execution sessions.
- [x] Add an API action that ends a live execution session cleanly.
- [x] End the live session only when the user leaves Execution or starts another run.
- [x] Test a long-running task and session termination from page navigation.

## Foreground migration and link output

- [x] Detect and stop only a stale PyIDE server belonging to the active Git clone.
- [x] Start a fresh foreground server after releasing the local port.
- [x] Print the manual browser URL without trailing punctuation in green.
- [x] Test the stale-server migration and Ctrl+C cleanup, then publish it.

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
