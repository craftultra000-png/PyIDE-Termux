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
