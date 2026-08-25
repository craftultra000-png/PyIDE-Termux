"""
Terminal Handler
================
Executes arbitrary shell commands in a controlled subprocess.
Dangerous commands (rm -rf /, format, etc.) are blocked.
"""

import subprocess
import os
import re
from config import TERMUX_HOME

# ─── Blocklist ────────────────────────────────────────────────────────────────
BLOCKED_PATTERNS = [
    r"rm\s+-rf\s+/[^a-zA-Z]",   # rm -rf /
    r"mkfs\.",                    # format disks
    r"dd\s+if=",                  # raw disk writes
    r":(){ :|:& };:",             # fork bomb
    r"chmod\s+777\s+/",          # chmod root
    r">/dev/sd",                  # write to block device
]

_BLOCKED_RE = [re.compile(p) for p in BLOCKED_PATTERNS]


def _is_dangerous(cmd: str) -> bool:
    for pattern in _BLOCKED_RE:
        if pattern.search(cmd):
            return True
    return False


def run_command(cmd: str, cwd: str = None) -> dict:
    """
    Execute *cmd* in a shell subprocess.

    cwd defaults to TERMUX_HOME.
    Returns {"stdout": ..., "stderr": ..., "returncode": ...}
    """
    if _is_dangerous(cmd):
        return {"error": "Command blocked for safety reasons", "returncode": -1}

    work_dir = cwd if (cwd and os.path.isdir(cwd)) else TERMUX_HOME

    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=work_dir,
            env={**os.environ, "TERM": "xterm-256color"},
        )
        return {
            "stdout":     result.stdout,
            "stderr":     result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": "Command timed out (30 s)", "returncode": -1}
    except Exception as exc:
        return {"error": str(exc), "returncode": -1}
