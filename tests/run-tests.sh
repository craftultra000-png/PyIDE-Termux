#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
node --experimental-default-type=module tests/js-unit.test.mjs
python3 -m unittest -v tests/test_file_handler.py tests/test_python_handler.py
bash tests/test_termux_launcher.sh
