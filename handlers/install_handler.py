"""
Install Handler
===============
Installs Python packages via pip or Termux packages via pkg.
Streams output line-by-line (collected, then returned as one payload).
"""

import subprocess
import shlex
from config import PYTHON_BIN


# Packages that should go through `pkg` instead of `pip`
PKG_PACKAGES = {
    "numpy", "scipy", "pillow", "pil",
    "pandas", "matplotlib", "lxml",
    "cryptography", "bcrypt",
}


def install_package(package: str, manager: str = "auto") -> dict:
    """
    Install *package* using pip, pkg, or auto-detect.

    manager: "pip" | "pkg" | "auto"
    Returns {"stdout": ..., "stderr": ..., "returncode": ...}
    """
    pkg_name = package.strip()
    if not pkg_name:
        return {"error": "No package name provided"}

    # Auto-detect
    if manager == "auto":
        manager = "pkg" if pkg_name.lower() in PKG_PACKAGES else "pip"

    if manager == "pip":
        cmd = [PYTHON_BIN, "-m", "pip", "install", "--upgrade", pkg_name]
    elif manager == "pkg":
        cmd = ["pkg", "install", "-y", pkg_name]
    else:
        return {"error": f"Unknown manager: {manager}"}

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {
            "stdout":     result.stdout,
            "stderr":     result.stderr,
            "returncode": result.returncode,
            "manager":    manager,
        }
    except subprocess.TimeoutExpired:
        return {"error": "Installation timed out (120 s)", "returncode": -1}
    except FileNotFoundError:
        return {"error": f"Command not found: {cmd[0]}", "returncode": -1}
    except Exception as exc:
        return {"error": str(exc), "returncode": -1}


def list_installed() -> dict:
    """Return list of installed pip packages."""
    try:
        result = subprocess.run(
            [PYTHON_BIN, "-m", "pip", "list", "--format=json"],
            capture_output=True, text=True, timeout=15,
        )
        import json
        packages = json.loads(result.stdout) if result.returncode == 0 else []
        return {"packages": packages}
    except Exception as exc:
        return {"error": str(exc)}
