import subprocess
import sys
import time
import unittest
from unittest.mock import patch

from handlers.terminal_handler import (poll_terminal_session, run_command,
                                       start_terminal_session, stop_terminal_session)


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

    def test_live_session_streams_output_before_command_finishes(self):
        command = f'{sys.executable} -u -c "import time; print(\'first\', flush=True); time.sleep(.2); print(\'second\', flush=True)"'
        started = start_terminal_session(command)
        self.assertIn("session", started)
        output = started["output"]
        result = started
        for _ in range(12):
            if result["done"]:
                break
            time.sleep(.05)
            result = poll_terminal_session(started["session"])
            output += result["output"]

        self.assertTrue(result["done"])
        self.assertIn("first", output)
        self.assertIn("second", output)

    def test_live_session_can_be_stopped(self):
        command = f'{sys.executable} -u -c "import time; print(\'waiting\', flush=True); time.sleep(10)"'
        started = start_terminal_session(command)
        try:
            stopped = stop_terminal_session(started["session"])
        finally:
            if not started.get("done"):
                stop_terminal_session(started["session"])

        self.assertTrue(stopped["done"])
        self.assertTrue(stopped["stopped"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
