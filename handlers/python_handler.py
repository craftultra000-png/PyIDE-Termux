"""
Python Handler
==============
Executes Python scripts (files or raw snippets) via subprocess.
Captures stdout/stderr and supports optional stdin injection.
"""

import subprocess
import os
import tempfile
from config import PYTHON_BIN, RUN_TIMEOUT


def run_file(path: str, stdin_data: str = "") -> dict:
    """
    Run the Python file at *path*.
    Returns {"stdout": ..., "stderr": ..., "returncode": ...}
    """
    if not os.path.isfile(path):
        return {"error": f"File not found: {path}"}

    try:
        result = subprocess.run(
            [PYTHON_BIN, path],
            input=stdin_data,
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
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(code)
            tmp_path = tmp.name

        result = subprocess.run(
            [PYTHON_BIN, tmp_path],
            input=stdin_data,
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
