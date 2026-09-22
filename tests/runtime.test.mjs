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

test('P2SH WebAssembly matches native Python across networks, thresholds, and key order', () => {
  const vectors = JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tests');from test_p2sh import trace,KEYS;print(json.dumps([{'input':dict(network=n,threshold=t,publicKeys=k),'trace':trace(n,t,k)} for n in ['mainnet','testnet'] for t in [1,2,3] for k in [KEYS,KEYS[::-1]]]))"], { cwd: root, encoding: 'utf8' }));
  for (const vector of vectors) {
    assert.deepEqual(JSON.parse(adapter.trace_p2sh(JSON.stringify(vector.input))), vector.trace);
  }
  assert.throws(() => adapter.trace_p2sh(JSON.stringify({ ...vectors[0].input, publicKeys: [input.publicKey, input.publicKey, input.publicKey] })), /distinct public keys/);
  assert.throws(() => adapter.trace_p2sh(JSON.stringify({ ...vectors[0].input, threshold: 0 })), /Require 1, 2, or 3/);
});

test('all modern lessons match CPython, including published Taproot vector and odd-y keys', () => {
  const vectors = JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tests');from test_modern import wasm_vectors;print(json.dumps(wasm_vectors()))"], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  for (const vector of vectors) {
    assert.deepEqual(JSON.parse(adapter.trace_lesson(JSON.stringify(vector.input))), vector.trace);
  }
  for (const kind of ['p2wpkh', 'nested', 'p2tr', 'compare']) {
    assert.throws(() => adapter.trace_lesson(JSON.stringify({ ...input, kind, publicKey: '02' + 'ff'.repeat(32) })), /ValueError/);
  }
  assert.throws(() => adapter.trace_lesson(JSON.stringify({ kind: 'p2wsh', publicKeys: [], threshold: 2 })), /ValueError/);
});

test('unsigned P2PKH transactions match CPython in WebAssembly', () => {
  const vectors = JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tests');from test_transactions import wasm_vectors;print(json.dumps(wasm_vectors()))"], { cwd: root, encoding: 'utf8' }));
  for (const vector of vectors) {
    assert.deepEqual(JSON.parse(adapter.trace_lesson(JSON.stringify(vector.input))), vector.trace);
  }
  const invalid = structuredClone(vectors[0].input);
  invalid.transaction.outputs[0].amount = '100001';
  assert.throws(() => adapter.trace_lesson(JSON.stringify(invalid)), /Outputs exceed inputs/);
});

test('P2PKH signing matches CPython for both SEC formats, networks, and multiple keys', () => {
  const vectors = JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tests');from test_signing import vectors;print(json.dumps(vectors()))"], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  for (const vector of vectors) {
    assert.deepEqual(JSON.parse(adapter.trace_lesson(JSON.stringify(vector.input))), vector.trace);
  }
  const invalid = structuredClone(vectors[0].input);
  invalid.transaction.inputs[0].privateKey = '0'.repeat(63) + '2';
  assert.throws(() => adapter.trace_lesson(JSON.stringify(invalid)), /do not match/);
});

test('header hashing in WebAssembly matches independently checked CPython traces', () => {
  const vectors = JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tests');from test_mining import vectors;print(json.dumps(vectors()))"], { cwd: root, encoding: 'utf8' }));
  for (const vector of vectors) assert.deepEqual(JSON.parse(adapter.trace_lesson(JSON.stringify(vector.input))), vector.trace);
});

test('P2PKH execution and failure experiments match CPython in WebAssembly', () => {
  const vectors = JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tests');from test_execution import wasm_vectors;print(json.dumps(wasm_vectors()))"], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  for (const vector of vectors) assert.deepEqual(JSON.parse(adapter.trace_lesson(JSON.stringify(vector.input))), vector.trace);
});
