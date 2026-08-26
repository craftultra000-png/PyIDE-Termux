import subprocess
import unittest
from unittest.mock import patch

from handlers.terminal_handler import run_command


class TerminalHandlerTests(unittest.TestCase):
    def test_forwards_full_pip_command_without_timeout(self):
        completed = subprocess.CompletedProcess(
            args="pip install matplotlib", returncode=0, stdout="installed\n", stderr=""
        )
        with patch("handlers.terminal_handler.subprocess.run", return_value=completed) as mocked_run:
            result = run_command("pip install matplotlib")

        args, kwargs = mocked_run.call_args
        self.assertEqual(args[0], "pip install matplotlib")
        self.assertTrue(kwargs["shell"])
        self.assertNotIn("timeout", kwargs)
        self.assertEqual(result["stdout"], "installed\n")
        self.assertEqual(result["returncode"], 0)

    def test_pkg_command_is_forwarded_as_a_shell_command(self):
        completed = subprocess.CompletedProcess(
            args="pkg install -y python", returncode=0, stdout="ok\n", stderr=""
        )
        with patch("handlers.terminal_handler.subprocess.run", return_value=completed) as mocked_run:
            result = run_command("pkg install -y python")

        self.assertEqual(mocked_run.call_args.args[0], "pkg install -y python")
        self.assertEqual(result["stdout"], "ok\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)
