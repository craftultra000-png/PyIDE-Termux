#!/usr/bin/env python3
"""
PyIDE-Termux Server
===================
Single-file HTTP server that:
  - Serves static assets (HTML/CSS/JS)
  - Handles all /api/* endpoints
  - Zero external dependencies (stdlib only)

Run:
    python server.py
Then open http://localhost:8080 in your browser.
"""

import sys
import os
import json
import logging
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from email.parser import BytesParser
from email.policy import HTTP

# ── Add project root to path so handlers can import config ───────────────────
sys.path.insert(0, os.path.dirname(__file__))

import config
from handlers.file_handler    import (list_dir, read_file, write_file,
                                       delete_path, create_folder,
                                       move_path, copy_path,
                                       upload_file, download_info)
from handlers.python_handler  import (run_file, run_snippet, start_file_session,
                                      send_session_input, poll_session)
from handlers.install_handler import install_package, list_installed
from handlers.terminal_handler import run_command

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(config.LOG_FILE, encoding="utf-8"),
    ],
)
log = logging.getLogger("pyide")

# ── MIME types ────────────────────────────────────────────────────────────────
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css",
    ".js":   "application/javascript",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
    ".json": "application/json",
    ".png":  "image/png",
    ".woff2": "font/woff2",
}

STATIC_ROOT = os.path.join(os.path.dirname(__file__), "static")
TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")


# ─────────────────────────────────────────────────────────────────────────────
class IDEHandler(BaseHTTPRequestHandler):
    """Main request handler — routes to static files or API endpoints."""

    # ── Logging ──────────────────────────────────────────────────────────────
    def log_message(self, fmt, *args):
        log.info("%s - %s", self.address_string(), fmt % args)

    # ── Helpers ──────────────────────────────────────────────────────────────
    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, msg: str, status: int = 400):
        self._send_json({"error": msg}, status)

    def _read_json_body(self) -> dict | None:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    def _parse_qs(self) -> dict:
        parsed = urllib.parse.urlparse(self.path)
        return dict(urllib.parse.parse_qsl(parsed.query))

    def _url_path(self) -> str:
        return urllib.parse.urlparse(self.path).path

    # ── CORS pre-flight ───────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self):
        path = self._url_path()

        # ── API ──────────────────────────────────────────────────────────────
        if path.startswith("/api/"):
            self._handle_get_api(path)
            return

        # ── Static files ─────────────────────────────────────────────────────
        if path == "/" or path == "/index.html":
            self._serve_file(os.path.join(TEMPLATE_DIR, "index.html"))
            return

        rel = path.lstrip("/")
        candidate = os.path.realpath(os.path.join(STATIC_ROOT, rel))
        if not candidate.startswith(os.path.realpath(STATIC_ROOT)):
            self._send_error_json("Forbidden", 403)
            return

        if os.path.isfile(candidate):
            self._serve_file(candidate)
        else:
            self._send_error_json("Not found", 404)

    def _handle_get_api(self, path: str):
        qs = self._parse_qs()

        if path == "/api/files":
            target = qs.get("path", config.TERMUX_HOME)
            self._send_json(list_dir(target))

        elif path == "/api/file":
            target = qs.get("path", "")
            if not target:
                self._send_error_json("Missing path")
                return
            self._send_json(read_file(target))

        elif path == "/api/download":
            target = qs.get("path", "")
            info = download_info(target)
            if "error" in info:
                self._send_error_json(info["error"])
                return
            try:
                with open(info["path"], "rb") as fh:
                    data = fh.read()
                self.send_response(200)
                self.send_header("Content-Type", info["mime"])
                self.send_header("Content-Length", str(info["size"]))
                self.send_header(
                    "Content-Disposition",
                    f'attachment; filename="{info["filename"]}"',
                )
                self.end_headers()
                self.wfile.write(data)
            except Exception as exc:
                self._send_error_json(str(exc))

        elif path == "/api/packages":
            self._send_json(list_installed())

        elif path == "/api/roots":
            candidates = [
                ("termux", config.TERMUX_HOME, "Termux Home"),
                ("shared", config.TERMUX_SHARED, "Shared Storage"),
                ("internal", config.SDCARD, "Internal Storage"),
            ]
            roots = [
                {"id": root_id, "path": root_path, "label": label}
                for root_id, root_path, label in candidates
                if os.path.exists(root_path)
            ]
            self._send_json({"roots": roots})

        else:
            self._send_error_json("Unknown endpoint", 404)

    # ── POST ──────────────────────────────────────────────────────────────────
    def do_POST(self):
        path = self._url_path()

        if path == "/api/file":
            self._api_write_file()
        elif path == "/api/folder":
            self._api_create_folder()
        elif path == "/api/move":
            self._api_move()
        elif path == "/api/copy":
            self._api_copy()
        elif path == "/api/run":
            self._api_run()
        elif path == "/api/run/session/start":
            self._api_run_session_start()
        elif path == "/api/run/session/input":
            self._api_run_session_input()
        elif path == "/api/run/session/poll":
            self._api_run_session_poll()
        elif path == "/api/cmd":
            self._api_cmd()
        elif path == "/api/install":
            self._api_install()
        elif path == "/api/upload":
            self._api_upload()
        else:
            self._send_error_json("Unknown endpoint", 404)

    # ── DELETE ────────────────────────────────────────────────────────────────
    def do_DELETE(self):
        path = self._url_path()
        if path == "/api/file":
            qs = self._parse_qs()
            target = qs.get("path", "")
            if not target:
                self._send_error_json("Missing path")
                return
            self._send_json(delete_path(target))
        else:
            self._send_error_json("Unknown endpoint", 404)

    # ── API POST implementations ───────────────────────────────────────────────
    def _api_write_file(self):
        body = self._read_json_body()
        if body is None:
            self._send_error_json("Invalid JSON")
            return
        result = write_file(body.get("path", ""), body.get("content", ""))
        self._send_json(result)

    def _api_create_folder(self):
        body = self._read_json_body()
        if body is None:
            self._send_error_json("Invalid JSON")
            return
        self._send_json(create_folder(body.get("path", "")))

    def _api_move(self):
        body = self._read_json_body()
        if body is None:
            self._send_error_json("Invalid JSON")
            return
        self._send_json(move_path(body.get("src", ""), body.get("dst", "")))

    def _api_copy(self):
        body = self._read_json_body()
        if body is None:
            self._send_error_json("Invalid JSON")
            return
        self._send_json(copy_path(body.get("src", ""), body.get("dst", "")))

    def _api_run(self):
        body = self._read_json_body()
        if body is None:
            self._send_error_json("Invalid JSON")
            return
        stdin = body.get("stdin", "")
        if "path" in body:
            result = run_file(body["path"], stdin)
        elif "code" in body:
            result = run_snippet(body["code"], stdin)
        else:
            self._send_error_json("Provide 'path' or 'code'")
            return
        self._send_json(result)

    def _api_run_session_start(self):
        body = self._read_json_body()
        if body is None or not body.get("path"):
            self._send_error_json("Provide a file path")
            return
        self._send_json(start_file_session(body["path"]))

    def _api_run_session_input(self):
        body = self._read_json_body()
        if body is None or not body.get("session"):
            self._send_error_json("Provide a session")
            return
        self._send_json(send_session_input(body["session"], str(body.get("value", ""))))

    def _api_run_session_poll(self):
        body = self._read_json_body()
        if body is None or not body.get("session"):
            self._send_error_json("Provide a session")
            return
        self._send_json(poll_session(body["session"]))

    def _api_cmd(self):
        body = self._read_json_body()
        if body is None:
            self._send_error_json("Invalid JSON")
            return
        cmd = body.get("cmd", "").strip()
        cwd = body.get("cwd", config.TERMUX_HOME)
        if not cmd:
            self._send_error_json("Missing cmd")
            return
        self._send_json(run_command(cmd, cwd))

    def _api_install(self):
        body = self._read_json_body()
        if body is None:
            self._send_error_json("Invalid JSON")
            return
        package = body.get("package", "").strip()
        manager = body.get("manager", "auto")
        if not package:
            self._send_error_json("Missing package")
            return
        self._send_json(install_package(package, manager))

    def _api_upload(self):
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_error_json("Expected multipart/form-data")
            return
        
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                self._send_error_json("No data")
                return
            
            raw = self.rfile.read(length)
            
            # استخدام email.parser بدلاً من cgi (محذوف في Python 3.13)
            msg = BytesParser(policy=HTTP).parsebytes(
                b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + raw
            )
            
            file_payload = None
            filename = "uploaded"
            dest_dir = config.TERMUX_HOME
            
            for part in msg.iter_parts():
                disp = part.get("Content-Disposition", "")
                if "filename" in disp:
                    file_payload = part.get_payload(decode=True)
                    for item in disp.split(";"):
                        item = item.strip()
                        if item.startswith("filename="):
                            filename = item.split("=", 1)[1].strip('"\'')
                elif 'name="path"' in disp:
                    dest_dir = part.get_content()
            
            if file_payload is None:
                self._send_error_json("No file found in upload")
                return
            
            result = upload_file(dest_dir, filename, file_payload)
            self._send_json(result)
            
        except Exception as exc:
            self._send_error_json(str(exc))

    # ── Static file serving ───────────────────────────────────────────────────
    def _serve_file(self, filepath: str):
        ext = os.path.splitext(filepath)[1].lower()
        mime = MIME.get(ext, "application/octet-stream")
        try:
            with open(filepath, "rb") as fh:
                data = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self._send_error_json("Not found", 404)
        except Exception as exc:
            self._send_error_json(str(exc), 500)


# ─────────────────────────────────────────────────────────────────────────────
def ensure_projects_dir():
    """Create the default projects directory if it doesn't exist."""
    try:
        os.makedirs(config.PROJECTS_DIR, exist_ok=True)
    except Exception:
        pass

def main():
    ensure_projects_dir()
    server = HTTPServer((config.HOST, config.PORT), IDEHandler)
    log.info("=" * 60)
    log.info("  PyIDE-Termux running at http://localhost:%d", config.PORT)
    log.info("  Press Ctrl+C to stop")
    log.info("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Server stopped.")
        server.server_close()

if __name__ == "__main__":
    main()
