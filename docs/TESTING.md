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
