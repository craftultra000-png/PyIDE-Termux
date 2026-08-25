#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAKE_BIN="$WORK/bin"
mkdir -p "$FAKE_BIN"

cat >"$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat >"$FAKE_BIN/termux-open-url" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$1" >"$PYIDE_TEST_OPENED_URL"
EOF

cat >"$FAKE_BIN/pkg" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$PYIDE_TEST_PKG_LOG"
EOF

chmod +x "$FAKE_BIN/curl" "$FAKE_BIN/termux-open-url" "$FAKE_BIN/pkg"

export PATH="$FAKE_BIN:$PATH"
export PYIDE_TEST_OPENED_URL="$WORK/opened-url"
export PYIDE_TEST_PKG_LOG="$WORK/pkg-log"

bash "$ROOT/scripts/pyide" --help | grep -q 'Usage: pyide'

if PYIDE_HOME="$WORK/missing" bash "$ROOT/scripts/pyide" >/dev/null 2>&1; then
  echo 'launcher unexpectedly accepted a missing installation' >&2
  exit 1
fi

PYIDE_HOME="$ROOT" PYIDE_PID_FILE="$WORK/pyide.pid" PYIDE_LOG_FILE="$WORK/pyide.log" bash "$ROOT/scripts/pyide" >"$WORK/launcher-output"
grep -q 'PyIDE is ready at http://127.0.0.1:8080' "$WORK/launcher-output"
grep -qx 'http://127.0.0.1:8080' "$PYIDE_TEST_OPENED_URL"
test ! -f "$WORK/pyide.pid"

PREFIX="$WORK/prefix" bash "$ROOT/scripts/install-termux.sh" >"$WORK/installer-output"
test -x "$WORK/prefix/bin/pyide"
grep -qx 'install -y python git curl' "$PYIDE_TEST_PKG_LOG"
grep -q 'Installed successfully' "$WORK/installer-output"

echo 'Termux launcher tests: OK'
