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


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
ARCHIVE_EXTENSIONS = {".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar", ".apk", ".whl"}
BINARY_EXTENSIONS = ARCHIVE_EXTENSIONS | {".pdf", ".mp3", ".wav", ".mp4", ".mkv", ".avi", ".so", ".dll", ".exe", ".bin", ".db", ".sqlite", ".pyc", ".ttf", ".otf"}
MAX_EDITOR_BYTES = 1_500_000
MAX_SEARCH_RESULTS = 250
MAX_SEARCH_FILES = 1_000
PROJECT_CONFIG_NAME = ".pyide.json"


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
    """Read only a verified, reasonably sized text file for the editor."""
    real, err = _safe(path)
    if err:
        return {"error": err}

    if not os.path.isfile(real):
        return {"error": "Not a file"}

    info = _file_kind(real)
    if info["kind"] != "text":
        return info

    try:
        with open(real, "r", encoding="utf-8", errors="strict") as fh:
            content = fh.read()
        return {**info, "content": content}
    except Exception as exc:
        return {"error": str(exc)}


def _file_kind(real: str) -> dict:
    """Classify a validated file without ever loading a binary payload in full."""
    name = os.path.basename(real)
    ext = os.path.splitext(name)[1].lower()
    mime, _ = mimetypes.guess_type(real)
    size = os.path.getsize(real)
    base = {"path": real, "name": name, "ext": ext, "size": size, "mime": mime or "application/octet-stream"}
    if ext in IMAGE_EXTENSIONS:
        return {**base, "kind": "image"}
    if ext in BINARY_EXTENSIONS or size > MAX_EDITOR_BYTES:
        return {**base, "kind": "binary"}
    try:
        with open(real, "rb") as fh:
            sample = fh.read(8192)
        if b"\x00" in sample:
            return {**base, "kind": "binary"}
        sample.decode("utf-8", errors="strict")
    except (UnicodeDecodeError, OSError):
        return {**base, "kind": "binary"}
    return {**base, "kind": "text"}


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


def preview_info(path: str) -> dict:
    """Return metadata for a raster image allowed to render inline in PyIDE."""
    real, err = _safe(path)
    if err:
        return {"error": err}
    if not os.path.isfile(real):
        return {"error": "Not a file"}
    info = _file_kind(real)
    if info["kind"] != "image":
        return {"error": "This file cannot be previewed as an image"}
    return {"ok": True, **info}


# ─── Project Search and Run Settings ──────────────────────────────────────────

def search_project(root: str, query: str) -> dict:
    """Search readable project files, returning bounded line-level matches."""
    real_root, err = _safe(root)
    if err:
        return {"error": err}
    if not os.path.isdir(real_root):
        return {"error": "Project root is not a directory"}
    needle = str(query or "").strip()
    if not needle:
        return {"error": "Search query is required"}
    if len(needle) > 240:
        return {"error": "Search query is too long"}

    results = []
    files_checked = 0
    folded = needle.casefold()
    try:
        for current, dirs, names in os.walk(real_root, followlinks=False):
            dirs[:] = [name for name in dirs if not name.startswith(".")]
            for name in names:
                if name.startswith("."):
                    continue
                files_checked += 1
                if files_checked > MAX_SEARCH_FILES:
                    return {"root": real_root, "query": needle, "results": results, "truncated": True}
                candidate = os.path.join(current, name)
                real_file, file_err = _safe(candidate)
                if file_err or not real_file or not os.path.isfile(real_file):
                    continue
                if _file_kind(real_file)["kind"] != "text":
                    continue
                try:
                    with open(real_file, "r", encoding="utf-8", errors="strict") as fh:
                        for line_number, line in enumerate(fh, start=1):
                            if folded not in line.casefold():
                                continue
                            results.append({
                                "path": real_file,
                                "relative": os.path.relpath(real_file, real_root),
                                "line": line_number,
                                "preview": line.strip()[:240],
                            })
                            if len(results) >= MAX_SEARCH_RESULTS:
                                return {"root": real_root, "query": needle, "results": results, "truncated": True}
                except (OSError, UnicodeDecodeError):
                    continue
    except OSError as exc:
        return {"error": str(exc)}
    return {"root": real_root, "query": needle, "results": results, "truncated": False}


def _inside_project(path: str, root: str) -> bool:
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:
        return False


def _normalise_project_config(root: str, entry="", args=None, cwd=".") -> tuple[dict | None, str | None]:
    """Validate project-local run metadata and resolve executable paths."""
    entry = str(entry or "").strip()
    cwd = str(cwd or ".").strip() or "."
    if os.path.isabs(entry) or os.path.isabs(cwd):
        return None, "Project settings must use relative paths"
    entry_path = os.path.realpath(os.path.join(root, entry)) if entry else ""
    cwd_path = os.path.realpath(os.path.join(root, cwd))
    if (entry and not _inside_project(entry_path, root)) or not _inside_project(cwd_path, root):
        return None, "Project settings must remain inside the selected project"
    if not os.path.isdir(cwd_path):
        return None, "Working directory does not exist"
    if entry and not os.path.isfile(entry_path):
        return None, "Entry file does not exist"
    if not isinstance(args, list) or any(not isinstance(arg, str) or len(arg) > 500 for arg in args) or len(args) > 64:
        return None, "Run arguments are invalid"
    return {
        "entry": entry,
        "args": args,
        "cwd": cwd,
        "entryPath": entry_path or None,
        "cwdPath": cwd_path,
    }, None


def read_project_config(root: str) -> dict:
    """Read a hidden project run configuration without exposing it in the explorer."""
    real_root, err = _safe(root)
    if err:
        return {"error": err}
    if not os.path.isdir(real_root):
        return {"error": "Project root is not a directory"}
    config_path = os.path.join(real_root, PROJECT_CONFIG_NAME)
    raw = {"entry": "", "args": [], "cwd": "."}
    if os.path.isfile(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as fh:
                loaded = json.load(fh)
            if not isinstance(loaded, dict):
                return {"error": "Project settings must be a JSON object"}
            raw.update({key: loaded.get(key, raw[key]) for key in raw})
        except (OSError, json.JSONDecodeError) as exc:
            return {"error": f"Unable to read project settings: {exc}"}
    config, config_error = _normalise_project_config(real_root, **raw)
    if config_error:
        return {"error": config_error}
    return {"root": real_root, "config": config}


def write_project_config(root: str, entry="", args=None, cwd=".") -> dict:
    """Save validated project-local run metadata into a hidden configuration file."""
    real_root, err = _safe(root)
    if err:
        return {"error": err}
    if not os.path.isdir(real_root):
        return {"error": "Project root is not a directory"}
    config, config_error = _normalise_project_config(real_root, entry, args or [], cwd)
    if config_error:
        return {"error": config_error}
    try:
        config_path = os.path.join(real_root, PROJECT_CONFIG_NAME)
        with open(config_path, "w", encoding="utf-8") as fh:
            json.dump({"entry": config["entry"], "args": config["args"], "cwd": config["cwd"]}, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        return {"ok": True, "root": real_root, "config": config}
    except OSError as exc:
        return {"error": str(exc)}
