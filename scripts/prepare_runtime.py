"""Vendor a pinned browser runtime and verified pure-Python wheels locally."""
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public' / 'runtime'
PACKAGES = {
    'bitcoin-utils': '0.8.7',
    'base58check': '1.0.2',
    'ecdsa': '0.19.2',
    'sympy': '1.14.0',
    'six': '1.17.0',
    'mpmath': '1.4.1',
}


def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read()


def main():
    source = ROOT / 'node_modules' / 'pyodide'
    if not source.exists():
        raise SystemExit('Run npm install first.')
    (DEST / 'wheels').mkdir(parents=True, exist_ok=True)
    for file in source.iterdir():
        if file.is_file() and file.suffix in {'.mjs', '.js', '.wasm', '.zip', '.json', '.md', '.txt'}:
            shutil.copy2(file, DEST / file.name)

    wheels = []
    previous_path = DEST / 'manifest.json'
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
    cached = {entry['package']: entry for entry in previous.get('wheels', [])}
    for name, version in PACKAGES.items():
        old = cached.get(name)
        if old and old['version'] == version:
            target = DEST / old['path']
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == old['sha256']:
                wheels.append(old)
                print(f'Verified cached {name} {version}', flush=True)
                continue
        metadata = json.loads(fetch(f'https://pypi.org/pypi/{name}/{version}/json'))
        wheel = next(item for item in metadata['urls'] if item['filename'].endswith('none-any.whl'))
        target = DEST / 'wheels' / wheel['filename']
        content = fetch(wheel['url'])
        digest = hashlib.sha256(content).hexdigest()
        if digest != wheel['digests']['sha256']:
            raise RuntimeError(f'Integrity mismatch for {name}')
        target.write_bytes(content)
        wheels.append({'package': name, 'version': version, 'path': f'wheels/{target.name}', 'sha256': digest, 'size': len(content)})
        print(f'Vendored {name} {version}: {len(content):,} bytes', flush=True)

    runtime_version = json.loads((source / 'package.json').read_text())['version']
    manifest = {'pyodideVersion': runtime_version, 'libraryVersion': PACKAGES['bitcoin-utils'], 'wheels': wheels}
    previous_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Local Pyodide {runtime_version} ready. No external runtime requests needed.')


if __name__ == '__main__':
    main()
