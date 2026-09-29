"""Packaging regressions: every local module ships, and old imports are forbidden."""
import importlib
import json
import unittest

from python_test_support import ROOT
import bitcoin_education


class EducationPackageTests(unittest.TestCase):
    def test_source_manifest_covers_local_runtime(self):
        source = ROOT / 'public/python'
        manifest = json.loads((source / 'manifest.json').read_text())['files']
        actual = sorted(path.relative_to(source).as_posix() for path in source.rglob('*.py'))
        self.assertEqual(sorted(manifest), actual)
        self.assertEqual(len(manifest), len(set(manifest)))
        self.assertTrue(str(bitcoin_education.__file__).startswith(str(source)))

    def test_removed_package_is_unavailable(self):
        with self.assertRaises(ModuleNotFoundError):
            importlib.import_module('bitcoinutils.learning')
