import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

let source = await readFile(new URL('../src/blockSimulation.ts', import.meta.url), 'utf8');
source = source
  .replace("import { LINKS, NODES } from './networkSimulation';", "const NODES = [{id:'A'},{id:'B'},{id:'C'},{id:'D'},{id:'E'}]; const LINKS = [['A','B'],['A','C'],['B','D'],['C','D'],['B','E'],['D','E']];")
  .replace("import type { NodeId } from './networkSimulation';", "type NodeId = 'A' | 'B' | 'C' | 'D' | 'E';");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { initialBlockSimulation, advanceBlockWave } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('pool node announces compact blocks to all connected peers in one wave', () => {
  const first = advanceBlockWave(initialBlockSimulation());
  assert.equal(first.wave, 1);
  assert.deepEqual(first.logs.map(log => `${log.message.from}-${log.message.to}-${log.message.kind}`), [
    'D-B-cmpctblock', 'D-C-cmpctblock', 'D-E-cmpctblock',
  ]);
  assert.equal(first.nodes.B, 'checking');
  assert.equal(first.nodes.C, 'reconstructing');
  assert.equal(first.nodes.E, 'checking');
});

test('missing compact-block transactions use getblocktxn and blocktxn before validation', () => {
  let state = initialBlockSimulation();
  let steps = 0;
  while (state.queue.length) {
    assert.ok(++steps < 20, 'block relay must settle');
    state = advanceBlockWave(state);
  }
  assert.deepEqual(state.nodes, { A: 'accepted', B: 'accepted', C: 'accepted', D: 'accepted', E: 'accepted' });
  assert.ok(state.logs.some(log => log.message.kind === 'getblocktxn' && log.message.from === 'C'));
  assert.ok(state.logs.some(log => log.message.kind === 'blocktxn' && log.message.to === 'C'));
  const request = state.logs.findIndex(log => log.message.kind === 'getblocktxn');
  const response = state.logs.findIndex(log => log.message.kind === 'blocktxn');
  assert.ok(request < response);
});
