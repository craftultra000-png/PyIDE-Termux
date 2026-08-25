#!/data/data/com.termux/files/usr/bin/bash
# Installs the pyide command for a Git-cloned copy of PyIDE Termux.
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
LAUNCHER="$APP_DIR/scripts/pyide"
TARGET="${PREFIX:-/data/data/com.termux/files/usr}/bin/pyide"

if [[ ! -f "$APP_DIR/server.py" || ! -f "$LAUNCHER" ]]; then
  printf 'Run this installer from a cloned PyIDE-Termux repository.\n' >&2
  exit 1
fi

if ! command -v pkg >/dev/null 2>&1; then
  printf 'This installer must be run inside Termux.\n' >&2
  exit 1
fi

printf 'Installing PyIDE dependencies…\n'
pkg install -y python git curl

mkdir -p "$(dirname "$TARGET")"
cp "$LAUNCHER" "$TARGET"
chmod 755 "$TARGET"

printf '\nInstalled successfully. Start PyIDE with:\n\n  pyide\n\n'
printf 'Optional Android shared-storage access:\n\n  termux-setup-storage\n\n'
