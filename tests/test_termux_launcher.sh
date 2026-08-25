#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAKE_BIN="$WORK/bin"
mkdir -p "$FAKE_BIN"

cat >"$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
state="${PYIDE_TEST_CURL_STATE:?}"
mode="${PYIDE_TEST_CURL_MODE:-ready}"
count=0
[[ -f "$state" ]] && count="$(cat "$state")"
count=$((count + 1))
printf '%s\n' "$count" >"$state"
if [[ "$mode" == 'stale-then-ready' ]]; then
  stale_state="$(ps -o stat= -p "${PYIDE_TEST_STALE_PID:?}" 2>/dev/null || true)"
  if [[ -n "$stale_state" && "$stale_state" != Z* ]]; then exit 0; fi
  if [[ -f "${PYIDE_TEST_PYTHON_PID:?}" ]] && kill -0 "$(cat "$PYIDE_TEST_PYTHON_PID")" 2>/dev/null; then exit 0; fi
  exit 1
fi
if [[ "$mode" == 'delayed' && "$count" -lt 2 ]]; then exit 1; fi
exit 0
EOF

cat >"$FAKE_BIN/pkg" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$PYIDE_TEST_PKG_LOG"
EOF

cat >"$FAKE_BIN/python" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$$" >"$PYIDE_TEST_PYTHON_PID"
exec sleep 60
EOF

chmod +x "$FAKE_BIN/curl" "$FAKE_BIN/pkg" "$FAKE_BIN/python"

export PATH="$FAKE_BIN:$PATH"
export PYIDE_TEST_PKG_LOG="$WORK/pkg-log"
export PYIDE_TEST_PYTHON_PID="$WORK/python-pid"

bash "$ROOT/scripts/pyide" --help | grep -q 'Ctrl+C'

if PYIDE_TEST_CURL_STATE="$WORK/missing-curl" PYIDE_HOME="$WORK/missing" bash "$ROOT/scripts/pyide" >/dev/null 2>&1; then
  echo 'launcher unexpectedly accepted a missing installation' >&2
  exit 1
fi

STALE_PID_FILE="$WORK/stale.pid"
sleep 60 &
STALE_PID="$!"
printf '%s\n' "$STALE_PID" >"$STALE_PID_FILE"
FAKE_PROC="$WORK/proc"
mkdir -p "$FAKE_PROC/$STALE_PID"
printf 'python\0server.py\0' >"$FAKE_PROC/$STALE_PID/cmdline"
ln -s "$ROOT" "$FAKE_PROC/$STALE_PID/cwd"
export PYIDE_TEST_STALE_PID="$STALE_PID"
export PYIDE_TEST_CURL_MODE=stale-then-ready
export PYIDE_TEST_CURL_STATE="$WORK/foreground-curl"
PYIDE_HOME="$ROOT" PYIDE_PROC_ROOT="$FAKE_PROC" bash "$ROOT/scripts/pyide" >"$WORK/foreground-output" 2>&1 &
LAUNCHER_PID="$!"
for _ in $(seq 1 30); do
  grep -q 'Press Ctrl+C in Termux to stop PyIDE.' "$WORK/foreground-output" 2>/dev/null && break
  sleep 0.1
done
grep -q 'Stopping the previous PyIDE server…' "$WORK/foreground-output"
grep -Fq $'\033[1;32mhttp://127.0.0.1:8080\033[0m' "$WORK/foreground-output"
if kill -0 "$STALE_PID" 2>/dev/null; then
  echo 'stale PyIDE server survived migration' >&2
  exit 1
fi
# Background Bash jobs inherit ignored INT in this non-interactive test shell.
# TERM exercises the same launcher trap and child cleanup used by Ctrl+C in Termux.
kill -TERM "$LAUNCHER_PID"
set +e
wait "$LAUNCHER_PID"
STATUS="$?"
set -e
test "$STATUS" -eq 130
grep -q 'Press Ctrl+C in Termux to stop PyIDE.' "$WORK/foreground-output"
grep -q 'Stopping PyIDE…' "$WORK/foreground-output"
if kill -0 "$(cat "$PYIDE_TEST_PYTHON_PID")" 2>/dev/null; then
  echo 'foreground Python process survived Ctrl+C' >&2
  exit 1
fi

CUSTOM_REPO="$WORK/phone-copy"
cp -a "$ROOT" "$CUSTOM_REPO"
export PYIDE_TEST_CURL_MODE=ready
export PYIDE_TEST_CURL_STATE="$WORK/installed-curl"
PREFIX="$WORK/prefix" bash "$CUSTOM_REPO/scripts/install-termux.sh" >"$WORK/installer-output"
test -x "$WORK/prefix/bin/pyide"
grep -Fq "PYIDE_HOME=$CUSTOM_REPO" "$WORK/prefix/bin/pyide"
bash "$WORK/prefix/bin/pyide" --status >"$WORK/installed-launcher-output"
grep -q 'PyIDE is running at http://127.0.0.1:8080' "$WORK/installed-launcher-output"
grep -qx 'install -y python git curl' "$PYIDE_TEST_PKG_LOG"
grep -q 'Installed successfully' "$WORK/installer-output"

echo 'Termux launcher tests: OK'
