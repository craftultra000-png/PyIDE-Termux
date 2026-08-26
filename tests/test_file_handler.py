"""Regression tests for filesystem safety and hidden-entry behaviour."""

import os
import sys
import tempfile
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from handlers import file_handler


class FileHandlerTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.root = self.workspace.name
        self.original_roots = file_handler.ALLOWED_ROOTS
        self.original_blocked = file_handler.BLOCKED_PREFIXES
        file_handler.ALLOWED_ROOTS = [self.root]
        file_handler.BLOCKED_PREFIXES = []

    def tearDown(self):
        file_handler.ALLOWED_ROOTS = self.original_roots
        file_handler.BLOCKED_PREFIXES = self.original_blocked
        self.workspace.cleanup()

    def test_list_dir_hides_dot_entries(self):
        os.makedirs(os.path.join(self.root, '.private'))
        os.makedirs(os.path.join(self.root, 'project'))
        with open(os.path.join(self.root, '.env'), 'w', encoding='utf-8') as file:
            file.write('SECRET=not-exposed')
        with open(os.path.join(self.root, 'main.py'), 'w', encoding='utf-8') as file:
            file.write('print(42)')

        result = file_handler.list_dir(self.root)
        self.assertNotIn('error', result)
        self.assertEqual([entry['name'] for entry in result['entries']], ['project', 'main.py'])

    def test_create_read_move_copy_and_delete_file(self):
        original = os.path.join(self.root, 'nested', 'main.py')
        moved = os.path.join(self.root, 'nested', 'renamed.py')
        copied = os.path.join(self.root, 'copy.py')

        self.assertTrue(file_handler.write_file(original, 'print(42)')['ok'])
        self.assertEqual(file_handler.read_file(original)['content'], 'print(42)')
        self.assertTrue(file_handler.move_path(original, moved)['ok'])
        self.assertTrue(file_handler.copy_path(moved, copied)['ok'])
        self.assertTrue(file_handler.delete_path(copied)['ok'])
        self.assertFalse(os.path.exists(copied))

    def test_rejects_path_outside_allowed_root(self):
        result = file_handler.write_file('/tmp/pyide-outside-root.txt', 'blocked')
        self.assertIn('error', result)
        self.assertFalse(os.path.exists('/tmp/pyide-outside-root.txt'))

    def test_classifies_images_and_blocks_binary_content_from_editor(self):
        image = os.path.join(self.root, 'chart.png')
        archive = os.path.join(self.root, 'bundle.zip')
        large_text = os.path.join(self.root, 'large.txt')
        with open(image, 'wb') as file:
            file.write(b'\x89PNG\r\n\x1a\nminimal-image')
        with open(archive, 'wb') as file:
            file.write(b'PK\x03\x04binary-archive')
        with open(large_text, 'w', encoding='utf-8') as file:
            file.write('x' * (file_handler.MAX_EDITOR_BYTES + 1))

        image_result = file_handler.read_file(image)
        archive_result = file_handler.read_file(archive)
        large_result = file_handler.read_file(large_text)
        preview = file_handler.preview_info(image)

        self.assertEqual(image_result['kind'], 'image')
        self.assertNotIn('content', image_result)
        self.assertEqual(archive_result['kind'], 'binary')
        self.assertNotIn('content', archive_result)
        self.assertEqual(large_result['kind'], 'binary')
        self.assertNotIn('content', large_result)
        self.assertTrue(preview['ok'])
        self.assertEqual(preview['kind'], 'image')

    def test_search_project_skips_hidden_and_binary_files(self):
        os.makedirs(os.path.join(self.root, 'src'))
        with open(os.path.join(self.root, 'src', 'main.py'), 'w', encoding='utf-8') as file:
            file.write('needle = 1\nprint(needle)\n')
        with open(os.path.join(self.root, '.hidden.py'), 'w', encoding='utf-8') as file:
            file.write('needle = 2\n')
        with open(os.path.join(self.root, 'archive.zip'), 'wb') as file:
            file.write(b'needle\x00')

        result = file_handler.search_project(self.root, 'needle')

        self.assertEqual([(item['relative'], item['line']) for item in result['results']], [('src/main.py', 1), ('src/main.py', 2)])
        self.assertFalse(result['truncated'])

    def test_reads_and_writes_project_run_settings(self):
        os.makedirs(os.path.join(self.root, 'src'))
        entry = os.path.join(self.root, 'src', 'main.py')
        with open(entry, 'w', encoding='utf-8') as file:
            file.write('print("ok")\n')

        saved = file_handler.write_project_config(self.root, 'src/main.py', ['--name', 'Ada'], 'src')
        loaded = file_handler.read_project_config(self.root)

        self.assertTrue(saved['ok'])
        self.assertEqual(loaded['config']['entry'], 'src/main.py')
        self.assertEqual(loaded['config']['args'], ['--name', 'Ada'])
        self.assertEqual(loaded['config']['cwd'], 'src')
        self.assertEqual(loaded['config']['entryPath'], entry)


if __name__ == '__main__':
    unittest.main(verbosity=2)
