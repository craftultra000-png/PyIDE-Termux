"""Regression tests for Python execution and stdin delivery."""

import os
import tempfile
import time
import unittest

from handlers.python_handler import run_file, start_file_session, send_session_input, poll_session


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
