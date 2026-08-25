"""
File Handler
============
CRUD operations for the filesystem: list, read, write, delete,
rename, copy, move, upload, and download.
All paths are validated against ALLOWED_ROOTS before any operation.
"""

import os
import shutil
import json
import mimetypes
import urllib.parse
from config import ALLOWED_ROOTS, BLOCKED_PREFIXES, TERMUX_HOME, MAX_UPLOAD_BYTES


# ─── Security ─────────────────────────────────────────────────────────────────

def _resolve(path: str) -> str | None:
    """
    Resolve *path* to a real absolute path and verify it is inside
    an allowed root and not inside a blocked prefix.
    Returns the real path on success, None on failure.
    """
    try:
        real = os.path.realpath(os.path.abspath(os.path.expanduser(path)))
    except Exception:
        return None

    # Must reside inside at least one allowed root. commonpath avoids the
    # prefix bug where /sdcard-copy would be considered inside /sdcard.
    allowed = any(
        os.path.commonpath([real, root]) == root
        for root in ALLOWED_ROOTS
    )
    if not allowed:
        return None

    # Must not be inside a blocked prefix
    blocked = any(
        os.path.commonpath([real, bp]) == bp
        for bp in BLOCKED_PREFIXES
        if os.path.exists(bp)
    )
    if blocked:
        return None

    return real


def _safe(path: str):
    """
    Return (real_path, None) on success or (None, error_message) on failure.
    """
    real = _resolve(path)
    if real is None:
        return None, f"Access denied: {path}"
    return real, None


# ─── List Directory ───────────────────────────────────────────────────────────

def list_dir(path: str) -> dict:
    """Return a JSON-serialisable dict describing the directory contents."""
    real, err = _safe(path)
    if err:
        return {"error": err}

    if not os.path.isdir(real):
        return {"error": "Not a directory"}

    entries = []
    try:
        names = sorted(os.listdir(real), key=lambda item: (not os.path.isdir(os.path.join(real, item)), item.casefold()))
        for name in names:
            # Dot-prefixed files are implementation or user-private data and
            # stay hidden by default, matching the expected IDE explorer UX.
            if name.startswith("."):
                continue
            full = os.path.join(real, name)
            is_dir = os.path.isdir(full)
            try:
                stat = os.stat(full)
                size = stat.st_size
                mtime = stat.st_mtime
            except OSError:
                size, mtime = 0, 0

            entries.append({
                "name":  name,
                "path":  full,
                "isDir": is_dir,
                "size":  size,
                "mtime": mtime,
                "ext":   "" if is_dir else os.path.splitext(name)[1].lower(),
            })
    except PermissionError:
        return {"error": "Permission denied"}

    return {
        "path":    real,
        "entries": entries,
    }


# ─── Read File ────────────────────────────────────────────────────────────────

def read_file(path: str) -> dict:
    """Read a text file and return its content."""
    real, err = _safe(path)
    if err:
        return {"error": err}

    if not os.path.isfile(real):
        return {"error": "Not a file"}

    try:
        with open(real, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
        return {"path": real, "content": content}
    except Exception as exc:
        return {"error": str(exc)}


# ─── Write / Create File ──────────────────────────────────────────────────────

def write_file(path: str, content: str) -> dict:
    """Create or overwrite a file with *content*."""
    real, err = _safe(path)
    if err:
        return {"error": err}

    try:
        os.makedirs(os.path.dirname(real), exist_ok=True)
        with open(real, "w", encoding="utf-8") as fh:
            fh.write(content)
        return {"ok": True, "path": real}
    except Exception as exc:
        return {"error": str(exc)}


# ─── Delete ───────────────────────────────────────────────────────────────────

def delete_path(path: str) -> dict:
    """Delete a file or a directory tree."""
    real, err = _safe(path)
    if err:
        return {"error": err}

    try:
        if os.path.isdir(real):
            shutil.rmtree(real)
        else:
            os.remove(real)
        return {"ok": True}
    except Exception as exc:
        return {"error": str(exc)}


# ─── Create Folder ────────────────────────────────────────────────────────────

def create_folder(path: str) -> dict:
    """Create a directory (including parents)."""
    real, err = _safe(path)
    if err:
        return {"error": err}

    try:
        os.makedirs(real, exist_ok=True)
        return {"ok": True, "path": real}
    except Exception as exc:
        return {"error": str(exc)}


# ─── Move / Rename ────────────────────────────────────────────────────────────

def move_path(src: str, dst: str) -> dict:
    """Move or rename *src* to *dst*."""
    real_src, err = _safe(src)
    if err:
        return {"error": err}

    real_dst, err = _safe(dst)
    if err:
        return {"error": err}

    try:
        os.makedirs(os.path.dirname(real_dst), exist_ok=True)
        shutil.move(real_src, real_dst)
        return {"ok": True, "dst": real_dst}
    except Exception as exc:
        return {"error": str(exc)}


# ─── Copy ─────────────────────────────────────────────────────────────────────

def copy_path(src: str, dst: str) -> dict:
    """Copy *src* to *dst*."""
    real_src, err = _safe(src)
    if err:
        return {"error": err}

    real_dst, err = _safe(dst)
    if err:
        return {"error": err}

    try:
        os.makedirs(os.path.dirname(real_dst), exist_ok=True)
        if os.path.isdir(real_src):
            shutil.copytree(real_src, real_dst)
        else:
            shutil.copy2(real_src, real_dst)
        return {"ok": True, "dst": real_dst}
    except Exception as exc:
        return {"error": str(exc)}


# ─── Upload ───────────────────────────────────────────────────────────────────

def upload_file(dest_dir: str, filename: str, data: bytes) -> dict:
    """Write raw *data* bytes to *dest_dir/filename*."""
    if len(data) > MAX_UPLOAD_BYTES:
        return {"error": "File too large"}

    real_dir, err = _safe(dest_dir)
    if err:
        return {"error": err}

    safe_name = os.path.basename(filename)
    if not safe_name:
        return {"error": "Invalid filename"}

    dest_path = os.path.join(real_dir, safe_name)
    real_dest, err = _safe(dest_path)
    if err:
        return {"error": err}

    try:
        os.makedirs(real_dir, exist_ok=True)
        with open(real_dest, "wb") as fh:
            fh.write(data)
        return {"ok": True, "path": real_dest}
    except Exception as exc:
        return {"error": str(exc)}


# ─── Download (metadata only — server.py streams the file) ───────────────────

def download_info(path: str) -> dict:
    """Validate *path* and return metadata needed for streaming."""
    real, err = _safe(path)
    if err:
        return {"error": err}

    if not os.path.isfile(real):
        return {"error": "Not a file"}

    mime, _ = mimetypes.guess_type(real)
    return {
        "ok":       True,
        "path":     real,
        "filename": os.path.basename(real),
        "mime":     mime or "application/octet-stream",
        "size":     os.path.getsize(real),
    }
