"""Load pinned core dependencies and project-local Python; prohibit old imports."""
import importlib.abc
import importlib.util
import json
from pathlib import Path
import sys
import zipfile

# Runtime source lives under public/; never leave CPython caches in static assets.
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ROOT / '.test-artifacts' / 'python-packages'
PACKAGES.mkdir(parents=True, exist_ok=True)
for wheel in json.loads((ROOT / 'public/runtime/manifest.json').read_text())['wheels']:
    with zipfile.ZipFile(ROOT / 'public/runtime' / wheel['path']) as archive:
        archive.extractall(PACKAGES)
sys.path.insert(0, str(PACKAGES))
sys.path.insert(0, str(ROOT / 'public/python'))


class NoLibraryLearning(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == 'bitcoinutils.learning' or fullname.startswith('bitcoinutils.learning.'):
            raise ModuleNotFoundError('Tests prohibit imports from the removed bitcoinutils.learning package.')


sys.meta_path.insert(0, NoLibraryLearning())
spec = importlib.util.spec_from_file_location('lesson_adapter', ROOT / 'public/python/lesson_adapter.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
