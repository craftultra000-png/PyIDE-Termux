"""Regression tests for Python execution and stdin delivery."""

import os
import tempfile
import time
import unittest

from handlers.python_handler import (run_file, start_file_session, start_repl_session,
                                     send_session_input, poll_session, stop_session)


class PythonHandlerTests(unittest.TestCase):
    def test_run_file_passes_newline_delimited_input(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as script:
            script.write("first = input('First: ')\nsecond = input('Second: ')\nprint(f'{first}|{second}')\n")
            path = script.name
        try:
            result = run_file(path, "alpha\nbeta")
        finally:
            os.unlink(path)

        self.assertEqual(result["returncode"], 0)
        self.assertIn("alpha|beta", result["stdout"])
        self.assertNotIn("EOFError", result["stderr"])

    def test_interactive_session_accepts_input_one_line_at_a_time(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as script:
            script.write("first = input('First: ')\nsecond = input('Second: ')\nprint(f'{first}|{second}')\n")
            path = script.name
        try:
            started = start_file_session(path)
            self.assertIn("session", started)
            output = started["output"]
            first = send_session_input(started["session"], "alpha")
            self.assertFalse(first["done"])
            output += first["output"]
            second = send_session_input(started["session"], "beta")
            output += second["output"]
            for _ in range(6):
                if second["done"]:
                    break
                time.sleep(0.05)
                second = poll_session(started["session"])
                output += second["output"]
        finally:
            os.unlink(path)

        self.assertTrue(second["done"])
        self.assertIn("alpha|beta", output)

    def test_interactive_session_runs_until_explicitly_stopped(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as script:
            script.write("import time\nprint('waiting', flush=True)\ntime.sleep(10)\n")
            path = script.name
        try:
            started = start_file_session(path)
            self.assertIn("session", started)
            self.assertFalse(started["done"])
            # Simulate a session older than the former 30-second kill limit
            # without slowing the test suite down. Polling it must not kill it.
            import handlers.python_handler as python_handler
            python_handler._SESSIONS[started["session"]].started_at = time.monotonic() - 31
            still_running = poll_session(started["session"])
            self.assertFalse(still_running["done"])
            stopped = stop_session(started["session"])
        finally:
            os.unlink(path)

        self.assertTrue(stopped["done"])
        self.assertTrue(stopped["stopped"])

    def test_quick_repl_executes_one_line_and_stays_available(self):
        started = start_repl_session()
        self.assertIn("session", started)
        session_id = started["session"]
        try:
            result = send_session_input(session_id, "print('quick-ok')")
            output = result["output"]
            for _ in range(6):
                if "quick-ok" in output:
                    break
                time.sleep(0.05)
                result = poll_session(session_id)
                output += result["output"]
            self.assertFalse(result["done"])
            self.assertIn("quick-ok", output)
        finally:
            stopped = stop_session(session_id)

        self.assertTrue(stopped["stopped"])

    def test_file_session_reports_new_raster_image_artifact(self):
        with tempfile.TemporaryDirectory() as workspace:
            path = os.path.join(workspace, "make_chart.py")
            with open(path, "w", encoding="utf-8") as script:
                script.write(
                    "from pathlib import Path\n"
                    "Path('chart.png').write_bytes(b'\\x89PNG\\r\\n\\x1a\\nchart')\n"
                    "print('chart-ready', flush=True)\n"
                    "import time\ntime.sleep(0.15)\n"
                )
            started = start_file_session(path)
            artifacts = list(started.get("artifacts", []))
            result = started
            for _ in range(8):
                if result.get("done"):
                    break
                time.sleep(0.05)
                result = poll_session(started["session"])
                artifacts.extend(result.get("artifacts", []))

        self.assertTrue(result["done"])
        self.assertIn("chart.png", [artifact["name"] for artifact in artifacts])

    def test_file_session_defers_gif_artifact_until_clean_exit(self):
        with tempfile.TemporaryDirectory() as workspace:
            path = os.path.join(workspace, "make_animation.py")
            with open(path, "w", encoding="utf-8") as script:
                script.write(
                    "import base64, time\n"
                    "gif = base64.b64decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')\n"
                    "with open('animation.gif', 'wb') as output:\n"
                    "    output.write(gif[:12])\n"
                    "    output.flush()\n"
                    "    time.sleep(0.3)\n"
                    "    output.write(gif[12:])\n"
                    "print('animation-ready', flush=True)\n"
                )
            started = start_file_session(path)
            self.assertFalse(started["done"])
            self.assertNotIn("animation.gif", [artifact["name"] for artifact in started["artifacts"]])
            partial = poll_session(started["session"])
            self.assertFalse(partial["done"])
            self.assertNotIn("animation.gif", [artifact["name"] for artifact in partial["artifacts"]])
            result = partial
            for _ in range(10):
                if result["done"]:
                    break
                time.sleep(0.05)
                result = poll_session(started["session"])

        self.assertTrue(result["done"])
        self.assertIn("animation.gif", [artifact["name"] for artifact in result["artifacts"]])

    def test_file_session_uses_arguments_and_explicit_working_directory(self):
        with tempfile.TemporaryDirectory() as workspace:
            script_dir = os.path.join(workspace, "src")
            working_dir = os.path.join(workspace, "runtime")
            os.makedirs(script_dir)
            os.makedirs(working_dir)
            path = os.path.join(script_dir, "main.py")
            with open(path, "w", encoding="utf-8") as script:
                script.write("import os, sys\nprint(os.getcwd())\nprint('|'.join(sys.argv[1:]))\n")
            started = start_file_session(path, args=["--name", "Ada"], cwd=working_dir)
            output = started["output"]
            result = started
            for _ in range(8):
                if result.get("done"):
                    break
                time.sleep(0.05)
                result = poll_session(started["session"])
                output += result["output"]

        self.assertTrue(result["done"])
        self.assertIn(working_dir, output)
        self.assertIn("--name|Ada", output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
