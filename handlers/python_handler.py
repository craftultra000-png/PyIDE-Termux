"""
Python Handler
==============
Executes Python scripts (files or raw snippets) via subprocess.
Captures stdout/stderr and supports optional stdin injection.
"""

import subprocess
import os
import tempfile
import time
import uuid
import threading
import select
from config import PYTHON_BIN, RUN_TIMEOUT


_SESSIONS: dict[str, "PythonSession"] = {}
_SESSIONS_LOCK = threading.Lock()


def _close_session(session: "PythonSession") -> None:
    for stream in (session.process.stdin, session.process.stdout):
        try:
            stream.close()
        except Exception:
            pass


class PythonSession:
    """A short-lived unbuffered Python process for terminal-style UI input."""

    def __init__(self, path: str):
        self.process = subprocess.Popen(
            [PYTHON_BIN, "-u", path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=os.path.dirname(path),
            bufsize=0,
        )
        self.started_at = time.monotonic()
        self.last_activity = self.started_at
        self._pending = bytearray()
        os.set_blocking(self.process.stdout.fileno(), False)

    def _drain(self, wait_seconds: float = 0.0) -> str:
        """Collect every byte currently available, including input() prompts."""
        fd = self.process.stdout.fileno()
        deadline = time.monotonic() + wait_seconds
        while True:
            timeout = max(0.0, deadline - time.monotonic())
            try:
                ready, _, _ = select.select([fd], [], [], timeout)
            except (OSError, ValueError):
                ready = []
            if not ready:
                break
            try:
                chunk = os.read(fd, 8192)
            except BlockingIOError:
                break
            if not chunk:
                break
            self._pending.extend(chunk)
            # After the first ready chunk, finish draining without waiting.
            deadline = time.monotonic()
        output = self._pending.decode("utf-8", errors="replace")
        self._pending.clear()
        return output

    def snapshot(self, wait_seconds: float = 0.0) -> dict:
        output = self._drain(wait_seconds)
        returncode = self.process.poll()
        done = returncode is not None
        return {
            "output": output,
            "done": done,
            "returncode": returncode,
        }

    def send(self, value: str) -> dict:
        if self.process.poll() is not None:
            return self.snapshot()
        try:
            self.process.stdin.write((value + "\n").encode("utf-8"))
            self.process.stdin.flush()
            self.last_activity = time.monotonic()
        except (BrokenPipeError, OSError):
            pass
        return self.snapshot(wait_seconds=0.12)

    def stop(self) -> dict:
        """End an interactive process when the user leaves Execution."""
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=0.5)
        return self.snapshot()


def _cleanup_sessions() -> None:
    with _SESSIONS_LOCK:
        for session_id, session in list(_SESSIONS.items()):
            if session.process.poll() is not None:
                _close_session(session)
                _SESSIONS.pop(session_id, None)


def start_file_session(path: str) -> dict:
    """Start a program immediately and return its early output/prompt."""
    if not os.path.isfile(path):
        return {"error": f"File not found: {path}"}
    _cleanup_sessions()
    try:
        session = PythonSession(path)
        session_id = uuid.uuid4().hex
        with _SESSIONS_LOCK:
            _SESSIONS[session_id] = session
        result = session.snapshot(wait_seconds=0.12)
        result["session"] = session_id
        if result["done"]:
            with _SESSIONS_LOCK:
                _SESSIONS.pop(session_id, None)
            _close_session(session)
        return result
    except Exception as exc:
        return {"error": str(exc), "returncode": -1}


def send_session_input(session_id: str, value: str) -> dict:
    """Send one terminal line to a live program and collect its next output."""
    with _SESSIONS_LOCK:
        session = _SESSIONS.get(session_id)
    if not session:
        return {"error": "Execution session is no longer available"}
    result = session.send(value)
    result["session"] = session_id
    if result["done"]:
        with _SESSIONS_LOCK:
            _SESSIONS.pop(session_id, None)
        _close_session(session)
    return result


def poll_session(session_id: str) -> dict:
    """Read output generated between user input events."""
    with _SESSIONS_LOCK:
        session = _SESSIONS.get(session_id)
    if not session:
        return {"error": "Execution session is no longer available"}
    result = session.snapshot()
    result["session"] = session_id
    if result["done"]:
        with _SESSIONS_LOCK:
            _SESSIONS.pop(session_id, None)
        _close_session(session)
    return result


def stop_session(session_id: str) -> dict:
    """End a live Execution session after its page has been left."""
    with _SESSIONS_LOCK:
        session = _SESSIONS.pop(session_id, None)
    if not session:
        return {"done": True, "returncode": None}
    result = session.stop()
    result["session"] = session_id
    result["stopped"] = True
    _close_session(session)
    return result


def run_file(path: str, stdin_data: str = "") -> dict:
    """
    Run the Python file at *path*.
    Returns {"stdout": ..., "stderr": ..., "returncode": ...}
    """
    if not os.path.isfile(path):
        return {"error": f"File not found: {path}"}

    # input() expects a newline-delimited stream. The UI accepts one value per
    # line, so normalise a final line that was entered without pressing Enter.
    stdin_stream = stdin_data if not stdin_data or stdin_data.endswith("\n") else f"{stdin_data}\n"

    try:
        result = subprocess.run(
            [PYTHON_BIN, path],
            input=stdin_stream,
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT,
            cwd=os.path.dirname(path),
        )
        return {
            "stdout":     result.stdout,
            "stderr":     result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": f"Timeout: script ran for more than {RUN_TIMEOUT}s", "returncode": -1}
    except Exception as exc:
        return {"error": str(exc), "returncode": -1}


def run_snippet(code: str, stdin_data: str = "") -> dict:
    """
    Execute a raw Python *code* string in a temporary file.
    Returns {"stdout": ..., "stderr": ..., "returncode": ...}
    """
    stdin_stream = stdin_data if not stdin_data or stdin_data.endswith("\n") else f"{stdin_data}\n"

    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(code)
            tmp_path = tmp.name

        result = subprocess.run(
            [PYTHON_BIN, tmp_path],
            input=stdin_stream,
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT,
        )
        return {
            "stdout":     result.stdout,
            "stderr":     result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": f"Timeout: {RUN_TIMEOUT}s exceeded", "returncode": -1}
    except Exception as exc:
        return {"error": str(exc), "returncode": -1}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
