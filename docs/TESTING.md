# Manual Verification Notes

## Navigation and editor — 25 August 2026

The updated local server was opened in a browser and its file explorer loaded from the new source tree. Selecting `sandbox.txt` opened the file immediately, made the editor visible, updated the active-file state and path label, and rendered the line numbers on the left of the LTR code surface. This confirms that direct file opening reaches the editor without requiring the context menu.

The settings control opened a dedicated settings page rather than a file-explorer tab. Package management rendered inside that page. The language control opened as a compact, anchored dropdown with all supported locales instead of a full-screen native selection overlay.

For input-flow verification, a temporary two-prompt Python file was created in Termux Home and appeared in the explorer after using the refresh control.

Opening that test file rendered four LTR lines with a left-side gutter. Pressing Run while its input area was empty opened the output input control and displayed guidance instead of sending an empty stream to Python. No `EOFError` was produced at this stage.

After entering `alpha` and `beta` on separate lines, running the file produced `Received: alpha|beta` with exit code `0`. This verifies end-to-end delivery from the visible input field through the run API to Python's `input()` calls.

The `/api/roots` response was also checked directly. It now returns only Termux Home and Shared Storage in this test environment; the retired `Storage Volumes` root is absent.

## Drawer and icon verification — 25 August 2026

The file-action toolbar now uses explicit SVG icons for creating a file, creating a folder, uploading files and refreshing. The location picker uses the same visual folder language rather than square fallback characters.

The drawer state was exercised on desktop and in a same-origin 390 px phone viewport. In the phone viewport, opening the drawer set it to visible and interactive with the backdrop enabled. Pressing its close button removed the `open` and backdrop states, with computed `visibility: hidden` and `pointer-events: none`; the drawer was translated beyond its own width. This validates that no right-side edge remains after closing.

A visual desktop pass confirmed that the file toolbar shows separate file-plus, folder-plus, cloud-upload and refresh symbols. A second visual pass in the 386 px embedded phone viewport confirmed that the drawer is absent after close and that the compact workspace remains usable without it.

## Theme and interactive input verification — in progress

The new appearance choices render and the Paper choice updates the document theme at runtime. The first desktop visual pass exposed remaining components with legacy fixed dark surfaces in the Paper theme. Those surfaces will be normalized to theme variables before release; this entry records the corrective finding rather than treating the visual state as passed.

After the corrective style pass, Paper reloaded with a light workspace, light sidebar and a consistent light bottom panel. A temporary `theme_input_test.py` file was created through the application API for the remaining editor and Output interaction checks.

Opening the test file exposed one overlay issue caused by an opaque textarea in Paper. It was fixed by restoring its transparent paint layer while keeping the editor container and syntax overlay on the solid theme surface. The editor then displayed readable, colored Python code on the stable white Paper background.

Running the test revealed an input composer directly inside the Output panel. Entering `Ada` and submitting it produced `Name: Hello, Ada!` with exit code `0`, confirming the end-to-end interactive input flow without a detached field.

An RTL phone viewport test at 386 px loaded the Termux theme correctly. Its closed drawer was hidden and translated on the positive horizontal axis (right side); open state had `right: 0`, no horizontal translation, and visible interaction. Closing restored the right-side translation and disabled pointer events. The test frame was then removed.

## Terminal-style input and library management — in progress

On desktop, the new settings navigation separates general preferences from a Libraries tab. The Libraries tab loaded 93 installed packages with names and versions, plus a package search field and refresh action. The remaining verification covers the live terminal-style input session and forced-LTR explorer on desktop and phone.

A temporary two-prompt script (`terminal_style_input_test.py`) was created through the test interface to exercise the live session endpoint. The workspace returned from settings and refreshed its file tree in preparation for the execution test.

The desktop session test opened that file and displayed `First:` within Output, followed by a single terminal-style input line. Entering `alpha` moved execution to `Second:`; entering `beta` produced `Result: alpha|beta` and `[exit 0]`. This confirms prompts, ordinary line input, sequential program execution and final output work without a detached multi-value form.

The 386 px RTL phone test found and then corrected an older RTL selector that still forced the closed explorer toward the right. The final computed state reports `direction: ltr`, `left: 0px`, and a negative X translation while closed; opening returns the translation to zero. This verifies the explorer stays LTR and enters from the left, regardless of interface locale.

## Standalone execution and terminal pages — in progress

With English selected, the desktop workspace now loaded without Arabic labels in the toolbar, explorer, welcome state or status surface. The new Terminal action opened its own page rather than a bottom panel. Running `printf 'terminal-ok'` inside that page returned `terminal-ok` with the next shell prompt, confirming the terminal page is usable.

Opening the two-prompt script and selecting Run opened the standalone Execution page, not a bottom panel. It displayed `First:`, accepted `alpha`, displayed `Second:`, accepted `beta`, and returned `Result: alpha|beta` with `[exit 0]`. This verifies the full-page execution view preserves ordinary, sequential Python input.

At a 386 px phone viewport with English selected, Settings rendered `Settings`, `General settings`, `Libraries`, and the English settings subtitle. No bottom panel was present. The standalone Terminal page was visible and its terminal surface measured 358 × 637 px, leaving appropriate mobile margins while preserving a practical command area.

## Inline console input — 25 August 2026

On desktop, the dedicated execution input footer and terminal command footer were removed from the page markup. The execution page rendered the Python prompt `First:` followed by a borderless `›` input line inside the output stream. Entering `alpha` appended the submitted value to that same stream and then rendered the next Python prompt, `Second:`, below it.

The dedicated Terminal page rendered its `$` prompt and editable command line inside its transcript. Executing `printf 'inline-ok'` echoed the command, printed `inline-ok`, and appended a new `$` line inside the same transcript. This confirms that terminal command entry no longer occupies a detached lower control.

The completed desktop execution pass entered `alpha` and `beta` in sequence and returned `Result: alpha|beta` with `[exit 0]`. The output stream contained no remaining runtime input after completion; a session-identity guard prevents a late polling response from adding one back.

In a same-origin 386 px phone viewport, Terminal measured a 356 px wide output area with its inline input nested inside that area, no horizontal overflow, and no legacy terminal footer. `printf 'mobile-inline'` executed successfully and returned a new inline prompt. The execution page measured a 332 px wide output area, displayed its `›` input within that stream, accepted `alpha` and `beta`, returned `Result: alpha|beta` with `[exit 0]`, and retained neither a runtime input nor the former `stdin-row` footer. English-only visible-interface inspection found no Arabic application labels; the sole Arabic string was the deliberately retained language-choice name, `العربية`.

The full automated regression suite also passed: JavaScript unit checks, Python compilation, file-operation tests, and sequential Python session tests. Closing process streams when a session completes removed the previous resource warnings.

## Android input and full-height console verification — 25 August 2026

Both live inputs now declare `autocapitalize="none"`, `autocorrect="off"`, `autocomplete="off"`, `spellcheck="false"`, `inputmode="text"`, and `enterkeyhint="enter"`. These mobile keyboard hints prevent sentence capitalization and correction from being requested by the web page. The handlers accept both the normal Enter key event and Android’s line-break input event, while ignoring text-composition confirmation so an IME cannot submit a partially composed value.

The phone verification used a same-origin 386 px viewport. Terminal now uses the entire workspace width and a 607 px transcript area; the execution page similarly uses a 589 px transcript area. Neither page has horizontal overflow or a detached input footer. The terminal accepted `printf 'phone-lowercase'` and kept a new `$` input prompt within its stream. The two-stage Python test accepted `alpha` and `beta` in sequence and returned `accepted: alpha|beta` with `[exit 0]`.

The desktop pass accepted `desktop` and `verified` through the same live Python flow and returned `accepted: desktop|verified` with `[exit 0]`; no runtime input was left after process completion. JavaScript syntax checks, Python compilation, file-operation tests, and interactive-session tests passed after this change.

## Python focus recovery and toolbar clarity — 25 August 2026

The command-palette control no longer reuses the terminal glyph. It now shows a distinct `⌘` mark and is labelled `Keyboard shortcuts`, while the adjacent `>_` control remains the dedicated Terminal action.

The execution session was tested with output emitted before `input()`: `program started`, followed by `enter your name =`. In both the desktop page and a 386 px phone viewport, the runtime input was connected inside the transcript and was the active document element after the prompt appeared. A simulated transcript tap also restored focus to the input. Sending `phone-focus-ok` returned `hello phone-focus-ok` with `[exit 0]`. The complete JavaScript and Python regression suite passed afterwards.

## Android keyboard loop prevention — 25 August 2026

The input row previously received a delayed focus call after every 180 ms polling response, which could repeatedly request the Android keyboard. Focus is now guarded per input transition. The focus request occurs once when a Python prompt first becomes available; polling responses retain the same visible input row without focusing it again. The focus-triggered scrolling listener was removed as well.

In a 386 px phone viewport, a test program remained paused at `value =` for more than four polling cycles. The runtime input remained visible and the instrumented focus call count stayed at one from first prompt through the final measurement. This verifies that the application no longer asks Android to reopen the keyboard repeatedly. JavaScript syntax checks, Python compilation, file-operation tests, and interactive-session tests all passed.

## Native runtime-input touch stability — 25 August 2026

The execution poller was still calling `append()` on the already-visible runtime row. Although the row did not receive another focus request, moving an active DOM input can blur it on Android and immediately dismiss the keyboard. The row is now appended only when it is not already a child of the output transcript. The transcript-wide pointer handler was also removed, leaving the native input element as the sole focus target.

In the desktop interaction check, a direct click on the runtime input left it connected and active, while its row stayed in the output transcript. During a 900 ms polling window, the row received zero repeated append calls and remained connected. This confirms that a normal tap can no longer be followed by a polling-triggered DOM move.

## Termux launcher verification — 25 August 2026

The repository now contains `scripts/pyide`, a lightweight launcher that starts the local server only when `127.0.0.1:8080` is unavailable, waits for readiness, and asks Android to open the local address. `scripts/install-termux.sh` installs the launcher into `$PREFIX/bin/pyide` after ensuring Python, Git, and curl are available.

The isolated shell test exercises the help screen, a missing-installation error path, reuse of an existing ready server, Android URL-opening invocation, and installation into a temporary Termux-style prefix. It also verifies that the installer requests `python`, `git`, and `curl` through `pkg`. The complete JavaScript and Python regression suite passes with this launcher test included.

## Foreground `pyide` launcher verification — 25 August 2026

The `pyide` command now runs the Python server in the foreground and does not try to open any browser application. It prints `http://127.0.0.1:8080` for the user to open manually, then remains attached to Termux. The launcher trap stops its child server cleanly when the foreground session receives Ctrl+C.

The launcher test verifies the ready-server path, foreground startup, printed manual-browser address, and child-process cleanup through the same trap used for Ctrl+C. The non-interactive test sends TERM because background Bash jobs ignore INT by design; the Termux foreground behavior remains Ctrl+C. All JavaScript and Python regression tests pass with this test included.

## Stale server migration and terminal URL output — 25 August 2026

The launcher now examines only processes whose working directory matches the active Git clone and whose command line identifies Python `server.py`. If such a previous PyIDE process is holding port 8080, `pyide` stops it, waits for the port to release, and starts a new foreground server owned by the current Termux session. A different process using the port is not stopped automatically.

The manual URL is printed as a standalone ANSI green value with no sentence-ending punctuation: `http://127.0.0.1:8080`. The isolated test simulates a stale clone-owned server, verifies that it is released, checks the raw green escape sequence, starts the new foreground server, and verifies signal cleanup. The JavaScript and Python regression suite passes afterwards.

## Unlimited Execution session lifecycle — 25 August 2026

Interactive Python sessions no longer use the former 30-second termination path. The focused Python test simulates a session that is already 31 seconds old, polls it, confirms that it remains live, and then stops it explicitly. A direct API check also started a live session, called `POST /api/run/session/stop`, and verified that a later poll reports the session as unavailable.

The browser pass used a Python file that printed `alive` and slept for 60 seconds. On desktop, the session stayed active in Execution and displayed its inline input; leaving through Back to editor, Terminal, or Settings sent the stop request. Pressing Run again sent stop for the existing session before starting its replacement. Clear erased only visible output while polling continued, so it did not terminate the process.

The same flow was verified in a 390 px phone viewport. The compact drawer, editor, and Execution page stayed within the viewport. The live session printed `alive`; Clear preserved it, and Back to editor sent the stop request. JavaScript syntax checks, Python compilation, file-operation tests, Python-session tests, and launcher tests passed afterwards.

## Kebab menu and Quick Python — 25 August 2026

The header wordmark was replaced with a compact Kebab trigger while Run remains immediately beside it. The menu contains Keyboard shortcuts, New file, Save, Terminal, Quick Python, Settings, and a visually separated red Disconnect and close session action. Desktop interaction confirmed that the menu opens normally and keeps all actions visible within its anchored panel.

Quick Python opens a standalone full-page local REPL with an inline `›` prompt. On desktop, `print('quick-ok')` echoed as `>>> print('quick-ok')`, printed `quick-ok`, and preserved a ready command line for the next entry. A direct API verification also started the REPL, executed `print('api-ok')`, received the expected output, and explicitly stopped the session.

The Disconnect action returned the page to the editor or welcome destination and sent `POST /api/run/session/stop`. In a same-origin 390 px phone viewport, the compact toolbar fit Run, Kebab, and Files; the full Kebab menu stayed within the frame, Quick Python occupied the page height without a detached footer, and `print('mobile-ok')` echoed and printed correctly. Leaving the phone page also sent the session-stop request. JavaScript syntax checks, Python compilation, file-operation tests, Python-session tests including the REPL test, and launcher tests passed afterwards.

## Phone toolbar, input typography, and Quick Python focus recovery — 25 August 2026

The RTL 390 px toolbar now places Kebab at x=340, Run at x=301 immediately to its left, and Files at x=268. This leaves the intended open space across the remainder of the header and matches the marked phone arrangement. The desktop pass retained the matching logical order for LTR: Kebab, Run, then Files.

Execution and Quick Python inline inputs now use the configured terminal text size rather than a hard-coded enlarged mobile size. In the tested phone configuration, the Quick Python input computed to 17 px, equal to the saved console setting. After explicitly dismissing the input focus, a pointer action on the empty Quick Python transcript restored focus; the phone test reported `refocused:true`. Both test REPL sessions were then exited with their back actions, each sending `POST /api/run/session/stop`. JavaScript syntax checks, Python compilation, file-operation tests, Python-session tests, and launcher tests passed after the change.

## Console typography and keyboard follow-up — 26 August 2026

The final phone CSS pass removed a later conflicting mobile rule. In the 390 px Arabic phone frame, Terminal now measured `13px/13px` for the editable command and its transcript output; Quick Python measured `13px/13px` as well. These values follow the same configurable console-size setting, so changing the terminal font setting changes the command prompt and its rendered output together.

The focus handler now responds to one ordinary `click` on the empty transcript, rather than suppressing the earlier touch event. Terminal refocused after 260 ms without an immediate blur, and Quick Python reported `quick-refocused:true` using the same interaction. The Files hamburger is positioned at the left mobile-toolbar edge, while Kebab and Run stay grouped on the right. The desktop Terminal executed `printf console-size-check` and displayed the echoed command, result, and next editable prompt with matching typography. The full JavaScript, Python, file-operation, Python-session, and Termux-launcher regression suite passed afterwards.

## Terminal font-size slider binding — 26 August 2026

The slider handler had still been applying an inline `font-size` only to `#terminal-output`, while the current console layout reads from the shared `--console-font-size` CSS variable. The handler now updates that shared variable immediately. In the desktop pass, moving the slider to 19 px produced `root:19px` and `fonts:19px/19px` for the terminal input and transcript. In the Arabic 390 px phone frame, moving it to 16 px produced `root:16px` and `fonts:16px/16px` for the same elements. JavaScript syntax checks, Python compilation, file-operation tests, Python-session tests, and launcher tests passed afterwards.

## Compact Acode-inspired Kebab menu — 26 August 2026

The Kebab menu was restyled into a denser command panel: a 248 px maximum width, 38–40 px rows, 13 px labels, 16–17 px icons, compact padding, and restrained dividers. The menu retains Keyboard shortcuts, New file, Save, Terminal, Quick Python, Settings, and the separated disconnect command. In the Arabic 390 px phone frame it measured `248x301` CSS pixels and kept every command visible in one panel. The desktop pass confirmed the same commands and compact visual hierarchy. JavaScript syntax checks, Python compilation, file-operation tests, Python-session tests, and launcher tests passed afterwards.

## Execution input focus recovery — 26 August 2026

The remaining Android keyboard dismissal was traced to the document-level Kebab-menu closer. It ran on every outside click and unconditionally blurred the active element, including the runtime input that the Execution transcript had just focused. The menu closer now blurs only when an open menu is actually dismissed. Execution’s tap-based focus recovery is also scheduled in the next animation frame, after document-level click handling completes; it is triggered by a user tap only and is never called from the 180 ms poll loop.

On the reloaded desktop page, a program that printed `ready for input`, waited at `Enter:`, and then printed the supplied value focused its inline input automatically. After explicit blur and a normal click on the empty transcript, the input regained focus, remained focused through 900 ms of polling, accepted `desktop-fixed`, and returned `got:desktop-fixed` with `[exit 0]`.

The same program was run in a same-origin 390 px phone frame. The inline input focused automatically at `Enter:`, recovered after blur plus a normal click on the output area, remained focused over several poll cycles, and produced `got:phone-ok` with `[exit 0]`. The frame had no horizontal overflow. A follow-up check confirmed that Terminal and Quick Python still recover their inline inputs after the same blur-and-output-click interaction. JavaScript syntax checks, Python compilation, seven handler tests, and the Termux launcher tests all passed.

## Acode menu structure and active-file header — 26 August 2026

The Kebab menu now follows the supplied Acode hierarchy rather than a single unstructured block. New file and Save form the first action group; Files, Keyboard shortcuts, Terminal, and Quick Python form the workspace group; Settings occupies its own group; and Disconnect remains visually separated as the destructive session action. Each group has a restrained divider, aligned icon column, consistent row rhythm, and touch-sized 56 px phone rows.

The toolbar now shows the basename of the open file directly beside the Files hamburger. The full path remains in the element title for reference, while the visible name truncates safely when space is limited. At 390 px, `sandbox.txt` remained visible with the Kebab and Run controls and the toolbar had no horizontal overflow.

In the Arabic 390 px same-origin phone frame, the menu measured 284 px from x=100 to x=384 and was entirely within the 390 px viewport. All eight actions stayed visible in the Acode-style section sequence. Selecting the new Files menu item closed the menu and opened the file drawer. The same action was also verified on desktop. JavaScript syntax checks, Python compilation, seven handler tests, and Termux launcher tests passed.

## Contextual tool headers and compact phone menu — 26 August 2026

The shared toolbar now carries the relevant context instead of duplicating large per-page headings. While editing or executing a file, it displays the basename beside Files. In Terminal it displays `الطرفية`; in Quick Python it displays `أوامر Python السريعة`. Terminal, Quick Python, and Settings hide the Run control, leaving a calmer and less crowded header. The open-file label now uses a flex layout beside Files, so it no longer overlaps the hamburger.

Execution, Terminal, and Quick Python now use the full remaining workspace height. Their previous large title/subtitle blocks were removed, leaving a compact transcript bar with a back action, environment or file label, and clear action. Desktop checks confirmed the shared Terminal title, hidden Run control, and full-height transcript. The embedded 390 px phone view confirmed `sandbox.txt` as the editor context and no overlap with Files.

The 390 px Kebab popup measured `236×349` pixels and remained inside the viewport without horizontal overflow, leaving the editor visible beneath it. Quick Python showed `أوامر Python السريعة`, hid Run, and used the full 696 px available tool height. Terminal showed `الطرفية`, also hid Run, used the same full 696 px height, and had no horizontal overflow. The Execution layout rendered as a full-height transcript with its file context. JavaScript syntax checks, Python compilation, seven handler tests, and Termux launcher tests passed.

## Terminal package commands and Acode-style settings — 26 August 2026

Terminal commands are now forwarded as complete shell strings and no longer use a fixed 30-second subprocess timeout. The server uses `ThreadingHTTPServer`, so a legitimate long-running installation command does not block unrelated editor, file, or Python-session requests. Focused handler tests assert that `pip install matplotlib` and `pkg install -y python` are passed intact to the shell and that no timeout parameter is supplied.

The old library installer was removed from Settings. Settings is now an Acode-inspired sequence of grouped rows for Application, Editor, Terminal, installed Libraries, and system information. Each row expands only its own compact details. The new read-only Libraries page lists packages and explains the required installation path: open More, select Terminal, then use `pip install <package-name>` for Python packages or `pkg install <package-name>` for Termux packages.

On desktop, the complete command `python3 -c "import time; time.sleep(1); print('shell-command-ok')"` was echoed intact, returned `shell-command-ok`, and restored a new prompt. In a 390 px phone frame, Settings had five navigation rows, no `settings-card` elements, no direct install input or button, and no horizontal overflow. The Libraries page displayed its two command examples and package list. Terminal accepted `printf 'mobile-command-ok'`, printed `mobile-command-ok`, and restored the next prompt. JavaScript syntax checks, Python compilation, nine handler tests, and Termux launcher tests passed.

## Live Terminal output and Matplotlib installation guidance — 26 August 2026

The old `/api/cmd` request used `subprocess.run(..., capture_output=True)`, so a package installation returned no visible output until the entire shell command exited. Terminal now starts an isolated process-group session, combines stdout and stderr, drains available bytes through polling every 180 ms, and stops the process group when the user leaves Terminal. This keeps the page responsive while rendering command progress as it arrives.

The reported Matplotlib failure was not a PyIDE parsing problem. On the reported Termux Python 3.14 environment, `pip install matplotlib` downloaded source and attempted to build Ninja; that build failed at `spawn.h` while compiling for Android. The official Termux packages repository contains the package as `packages/matplotlib`, with Android-aware dependencies including Python, Ninja, NumPy, Pillow, and Freetype. The Libraries guide therefore now recommends `pkg install matplotlib` for Matplotlib on Termux, while retaining generic `pip install <package-name>` guidance for ordinary pure-Python packages. [Termux Matplotlib package definition](https://github.com/termux/termux-packages/blob/master/packages/matplotlib/build.sh)

On desktop, the staged command printed `first-live` while it was still sleeping, then printed `second-live` and restored the prompt. The same staged test in the 390 px phone frame printed `mobile-first` before completion, then `mobile-second`, restored the next prompt, and had no horizontal overflow. The mobile Libraries page showed `pkg install matplotlib` with no direct installer controls. JavaScript syntax checks, Python compilation, eleven handler tests, and Termux launcher tests passed.

## Safe file previews and inline execution charts — 26 August 2026

On desktop, a Python fixture wrote `pyide_preview_chart.png` alongside its script. Execution displayed the script message, an inline raster-image card, and `[exit 0]`; clicking the card opened the dedicated full-workspace image viewer with a protected `/api/preview` source and a download action. Opening `pyide_preview_bundle.zip` displayed a non-text safety notice and the same protected download path rather than passing archive bytes to the editor. A plain `.txt` fixture still opened normally in the LTR editor.

The same flow was exercised through Chromium device emulation at an actual 390 × 760 CSS-pixel viewport. The initial workspace, rendered execution artifact, and ZIP safety notice each reported no horizontal overflow. The image card remained readable and tappable in the full-height Execution page; the ZIP view preserved its download affordance and clear Arabic safety message. Focused handler tests confirm the backend classifies images separately, keeps binary/archive bytes out of editor content, and reports newly saved raster images from a Python run without depending on Matplotlib in CI.

## File closure and destination paste menu — 26 August 2026

The Kebab menu now includes `إغلاق الملف`. On desktop, opening a text fixture and choosing this action returned the workspace to its no-file state, cleared the active editor selection, retained the file on disk, and displayed a confirmation. If a text file has unsaved edits, PyIDE saves it before closing instead of silently discarding it; closing an image or binary preview simply closes the workspace preview.

The file explorer now accepts a context-menu gesture on its blank list area. With a copied folder selected from Shared Storage, opening this destination menu in Termux Home presented only `لصق هنا`, enabled it, and copied the complete nested folder structure into the home destination. The desktop filesystem check found the copied nested `note.txt`. In the actual 390 × 760 phone viewport, the Files drawer stayed within the screen and the destination menu was visible inside its open blank list area, with no horizontal overflow.

## Destination creation menu — 26 August 2026

The blank-space destination menu now presents `ملف جديد`, `مجلد جديد`, and `لصق هنا`. It preserves the narrower destination-only menu rather than exposing item actions such as Rename, Download, or Delete where no item is selected. On desktop, selecting New folder preselected `/home/ubuntu`, created `pyide_destination_menu_folder`, and refreshed the explorer. Selecting New file from the same blank-space menu preselected the same destination, created `pyide_destination_menu_file.py`, and opened the new empty file directly in the editor.

The actual 390 × 760 phone viewport showed all three destination actions inside the open Files drawer without horizontal overflow. The same mobile pass created a folder and a Python file in Termux Home, closed both creation dialogs correctly, and opened the created Python file in the editor. JavaScript syntax and unit checks passed before the final regression run.

## Project workflow, tabs, search, run settings, and local completion — 26 August 2026

Desktop verification used a temporary project containing `main.py`, `helper.py`, and `README.md`. Project search scoped itself to the selected project directory, returned `README.md:3` for a marker query, and opened the result with the editor selection on line 3. Opening README and helper created two file tabs. A local unsaved completion in helper persisted after switching to README and back; closing the dirty helper tab saved the modification first and left README open.

The project run settings form stored `main.py`, a two-line argument list, and `.` as the working directory in hidden `.pyide.json`. The Run project action then showed the configured command and returned the expected greeting, working directory, and argument values in Execution. On the actual 390 × 760 phone viewport, project search stayed within the selected project, tabs remained compact, local completion offered `print` for `pri`, and the document reported no horizontal overflow.

## Inline GIF artifact loading — 26 August 2026

Desktop verification used a temporary Python file that created a GIF in two write operations with a delay in between, deliberately exposing the artifact before it was valid. Execution first showed a visible loading state, retried the preview with a cache-busting URL, and then changed to the ready caption automatically after the file was complete. The preview endpoint also now bases `Content-Length` on the bytes actually read, avoiding a stale pre-read size if an image is still growing.

The same deliberately incomplete GIF was run inside a 390 px-wide phone frame. After the retry cycle, the image reported a nonzero natural width and height, the loading state was removed, the caption offered full-size opening, and the phone document had no horizontal overflow.

## Stable animated-artifact delivery — 27 August 2026

The original retry-only approach was replaced after observing that Pillow can keep a GIF open while it writes every animation frame. A deliberately slow GIF test confirmed that no artifact card appears during the write. When the Python process exits successfully, the completed GIF is delivered once, loads directly in Execution, and has a ready caption. The same flow was verified in a 390 px phone frame: the early check found no artifact and no exit marker, while the final check found a complete image with nonzero intrinsic width, no loading state, and no horizontal overflow.

## Complete interface translations — 28 August 2026

Automated browser verification selected Arabic, English, Spanish, French, German, Turkish, Russian, and Hindi in turn. Every rendered `data-i18n` element matched the selected locale catalog, with no fallback values. Arabic correctly set the document to RTL; the other seven languages set it to LTR. The language selector was enlarged to a 50 px mobile touch target with 45 px language options.

The initial inspection revealed static English labels in the workspace-root chips and accessible control names. These were connected to the same locale catalog, including the command palette, theme-name captions, input placeholders, and all translated accessible names. A final desktop sweep confirmed that text nodes, titles, placeholders, and accessible labels match their selected catalog across all eight locales; Arabic is RTL and all other locales remain LTR. Code, paths, line numbers, terminal output, and editor surfaces remain explicitly LTR.

On the final 390 px phone frame, the enlarged language trigger measured 166 × 50 px and every option measured 45 px high. The complete 360 px-high menu stayed inside the frame (left 21 px, right 187 px; top 294 px, bottom 654 px), with no horizontal overflow. Arabic, English, Spanish, French, German, Turkish, Russian, and Hindi each passed text and accessible-label checks inside the phone frame; Arabic was RTL and every other locale was LTR.

Final regression passed on 28 August 2026: `git diff --check`, JavaScript syntax validation for `i18n.js` and `app.js`, the language-coverage JS unit test, Python byte-compilation, and `bash tests/run-tests.sh`. The full suite passed all 17 Python tests and the Termux launcher checks.

## Stable More-menu toolbar placement — 28 August 2026

The toolbar now uses an intentionally LTR physical layout: Files stay on the left while More stays on the right, independently from the locale’s text direction. On desktop, an actual open-file → Run → Execution → Back sequence was exercised in Arabic and Hindi. In both cases, the returned editor showed More 14 px from the right viewport edge, and its open menu aligned to the same right edge. The locale remained independent from the navigation state.

The same actual sequence passed in a 390 × 760 phone frame in Arabic and Hindi. After returning from Execution, More measured from x=348 to x=382, so it remained 8 px from the right edge. Its menu measured from x=151 to x=382 and aligned with the trigger on the right. The phone frame had no horizontal overflow, and Arabic was restored after the check.

Final regression passed after the placement correction: `git diff --check`, JavaScript syntax validation, Python byte-compilation, the JavaScript unit suite, all 17 Python tests, and the Termux launcher checks.


## Editor bidi integrity and hybrid WebGL output — 02 September 2026

The editor reproduction used pasted Python containing Arabic comments, Arabic and Latin strings, punctuation, and long mixed-language lines. Both the transparent textarea and syntax overlay now report `direction: ltr`, `unicode-bidi: embed`, `white-space: pre`, and matching horizontal overflow. Selecting the full 157-character sample kept the selection range intact from 0 to 157, with no horizontal overflow or line-box inversion. The code gutter remained separate on the left in the desktop visual pass.

The execution path now recognizes `*.pyide-webgl.json` and `*.webgl.json` files written by a Python process as interactive artifacts. A local Three.js renderer displays box, sphere, or torus scenes with automatic rotation, pointer/touch orbit, and wheel zoom. Existing raster image and GIF artifacts continue through the existing image preview path. A real Python run produced `scene-two.pyide-webgl.json`, rendered a torus in a 738 × 280 desktop canvas, and showed the touch/orbit caption inside Execution.

In a same-origin 390 × 760 phone frame, the WebGL canvas measured 326 × 220, the output area had zero horizontal overflow, and the body remained 390 px wide. The editor and WebGL output remained within the phone layout. If the browser lacks a WebGL context, the viewer keeps the output page usable and reports a bounded WebGL-unavailable message instead of breaking the execution page.

The final regression passed: `git diff --check`, JavaScript syntax checks for `app.js` and `webgl-viewer.js`, JavaScript unit tests, Python byte-compilation, all 18 Python tests, and the Termux launcher tests.
