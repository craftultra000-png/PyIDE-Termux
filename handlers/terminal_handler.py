"""
Terminal Handler
================
Executes arbitrary shell commands in a controlled subprocess.
Dangerous commands (rm -rf /, format, etc.) are blocked.
"""

import os
import re
import select
import signal
import subprocess
import time
import uuid
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
_SESSIONS = {}


class TerminalSession:
    """A shell process whose combined stdout/stderr can be drained incrementally."""

    def __init__(self, cmd: str, cwd: str):
        self.process = subprocess.Popen(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            cwd=cwd,
            env={**os.environ, "TERM": "xterm-256color"},
            start_new_session=True,
        )
        self._buffer = bytearray()

    def _drain(self) -> str:
        stream = self.process.stdout
        if stream is None:
            return ""
        while True:
            ready, _, _ = select.select([stream], [], [], 0)
            if not ready:
                break
            chunk = os.read(stream.fileno(), 4096)
            if not chunk:
                break
            self._buffer.extend(chunk)
        output = bytes(self._buffer).decode("utf-8", errors="replace")
        self._buffer.clear()
        return output

    def snapshot(self) -> dict:
        return {
            "output": self._drain(),
            "done": self.process.poll() is not None,
            "returncode": self.process.poll(),
        }

    def close(self) -> None:
        if self.process.stdout is not None:
            self.process.stdout.close()

    def stop(self) -> dict:
        if self.process.poll() is None:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid, signal.SIGKILL)
                self.process.wait(timeout=2)
        result = {**self.snapshot(), "stopped": True}
        self.close()
        return result


def _is_dangerous(cmd: str) -> bool:
    for pattern in _BLOCKED_RE:
        if pattern.search(cmd):
            return True
    return False


def start_terminal_session(cmd: str, cwd: str = None) -> dict:
    """Start *cmd* and return immediately so the UI can poll its live output."""
    if _is_dangerous(cmd):
        return {"error": "Command blocked for safety reasons", "returncode": -1}
    work_dir = cwd if (cwd and os.path.isdir(cwd)) else TERMUX_HOME
    try:
        session_id = uuid.uuid4().hex
        session = TerminalSession(cmd, work_dir)
        _SESSIONS[session_id] = session
        result = {"session": session_id, **session.snapshot()}
        if result["done"]:
            _SESSIONS.pop(session_id, None)
        return result
    except Exception as exc:
        return {"error": str(exc), "returncode": -1}


def poll_terminal_session(session_id: str) -> dict:
    session = _SESSIONS.get(session_id)
    if session is None:
        return {"error": "Unknown terminal session", "done": True, "returncode": -1}
    result = session.snapshot()
    if result["done"]:
        # Give a finished process one final non-blocking drain on its next poll
        # before releasing it; the client stops polling after `done`.
        _SESSIONS.pop(session_id, None)
        session.close()
    return result


def stop_terminal_session(session_id: str) -> dict:
    session = _SESSIONS.pop(session_id, None)
    if session is None:
        return {"error": "Unknown terminal session", "done": True, "returncode": -1}
    return session.stop()


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
            cwd=work_dir,
            env={**os.environ, "TERM": "xterm-256color"},
        )
        return {
            "stdout":     result.stdout,
            "stderr":     result.stderr,
            "returncode": result.returncode,
        }
    except Exception as exc:
        return {"error": str(exc), "returncode": -1}
