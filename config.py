"""
PyIDE-Termux Configuration
==========================
Central configuration for paths, security, and server settings.
"""

import os

# ─── Server Settings ─────────────────────────────────────────────────────────
HOST = "0.0.0.0"
PORT = 8080

# ─── Paths ───────────────────────────────────────────────────────────────────
TERMUX_HOME      = os.path.expanduser("~")
SDCARD           = "/sdcard"
STORAGE          = "/storage"
PROJECTS_DIR     = os.path.join(TERMUX_HOME, "storage", "shared", "PyIDE-Projects")
TERMUX_SHARED     = os.path.join(TERMUX_HOME, "storage", "shared")

# ─── Allowed Root Paths (security) ───────────────────────────────────────────
ALLOWED_ROOTS = [
    os.path.realpath(TERMUX_HOME),
    os.path.realpath(SDCARD),
    os.path.realpath(STORAGE),
]

# Blocked prefixes — even if somehow under an allowed root
BLOCKED_PREFIXES = [
    "/data/data/com.termux/files/usr",
    "/system",
    "/proc",
    "/sys",
    "/dev",
]

# ─── Python Executable ───────────────────────────────────────────────────────
PYTHON_BIN = "python"   # Termux uses 'python' for Python 3

# ─── Process Timeout (seconds) ───────────────────────────────────────────────
RUN_TIMEOUT = 30

# ─── Max Upload Size (bytes) ─────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 50 * 1024 * 1024   # 50 MB

# ─── Log File ────────────────────────────────────────────────────────────────
LOG_FILE = os.path.join(TERMUX_HOME, ".pyide-termux.log")
