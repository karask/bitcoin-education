import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeDir = `${root}public/runtime/`;
const input = { publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', network: 'mainnet', compressed: true };
let adapter;

before(async () => {
  const py = await loadPyodide({ indexURL: runtimeDir, fullStdLib: false });
  const sitePackages = py.runPython("import sysconfig; sysconfig.get_paths()['purelib']");
  const manifest = JSON.parse(await readFile(`${runtimeDir}manifest.json`, 'utf8'));
  assert.equal(manifest.pyodideVersion, '314.0.7');
  for (const wheel of manifest.wheels) {
    const bytes = await readFile(`${runtimeDir}${wheel.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), wheel.sha256, `${wheel.package} integrity`);
    py.unpackArchive(new Uint8Array(bytes), 'zip', { extractDir: sitePackages });
  }
  py.FS.mkdirTree('/app');
  py.FS.writeFile('/app/lesson_adapter.py', await readFile(`${root}public/python/lesson_adapter.py`, 'utf8'));
  py.runPython("import sys; sys.path.insert(0, '/app')");
  adapter = py.pyimport('lesson_adapter');
});

test('WebAssembly produces the known compressed mainnet vector and full payload', () => {
  const trace = JSON.parse(adapter.trace_p2pkh(JSON.stringify(input)));
  assert.equal(trace.address, '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
  assert.equal(trace.steps[6].hex, '00751e76e8199196d454941c45d1b3a323f1433bd6510d1634');
});

test('every WebAssembly intermediate value matches native CPython for both networks and formats', () => {
  const native = JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tests');from test_p2pkh import trace,VECTORS;print(json.dumps([trace(n,c) for n,c,_ in VECTORS]))"], { cwd: root, encoding: 'utf8' }));
  for (const expected of native) {
    const result = JSON.parse(adapter.trace_p2pkh(JSON.stringify({ ...input, network: expected.network, compressed: expected.compressed })));
    assert.deepEqual(result, expected);
  }
});

test('WebAssembly rejects malformed and off-curve keys rather than returning stale or synthetic values', () => {
  for (const publicKey of ['abcd', '05' + '00'.repeat(32), '02' + 'ff'.repeat(32)]) {
    assert.throws(() => adapter.trace_p2pkh(JSON.stringify({ ...input, publicKey })), /ValueError/);
  }
});
