"""Regression tests for Python execution and stdin delivery."""

import os
import tempfile
import unittest

from handlers.python_handler import run_file


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
