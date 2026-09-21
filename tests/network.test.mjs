import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile the import-free TS model for Node without changing the production bundle.
const source = await readFile(new URL('../src/networkSimulation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { initialSimulation, advanceSimulation, addCompetition } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const defaults = { feeRate: 1000 / 225, selectiveMinimum: 5, missingAtC: false, offlineE: false };
function finish(options = defaults) {
  let state = initialSimulation(options);
  let steps = 0;
  while (state.queue.length) {
    assert.ok(++steps < 100, 'message scheduling must terminate');
    const before = JSON.stringify(state);
    const next = advanceSimulation(state, options);
    assert.equal(JSON.stringify(state), before, 'stepping must not mutate past state');
    state = next;
  }
  return state;
}

test('delivery and checking are separate, admission precedes announcements', () => {
  const initial = initialSimulation(defaults);
  assert.equal(initial.nodes.A, 'unseen');
  const received = advanceSimulation(initial, defaults);
  assert.equal(received.nodes.A, 'checking');
  assert.deepEqual(received.queue.map(e => e.kind), ['check']);
  const admitted = advanceSimulation(received, defaults);
  assert.equal(admitted.nodes.A, 'accepted');
  assert.deepEqual(admitted.queue.map(e => e.kind), ['announce', 'announce']);
  const requested = advanceSimulation(admitted, defaults);
  assert.equal(requested.nodes.B, 'requested');
  assert.equal(requested.nodes.C, 'unseen');
});

test('default fee policy differs locally; redundant announcements do not loop', () => {
  const state = finish();
  assert.deepEqual(state.nodes, { A: 'accepted', B: 'accepted', C: 'policy', D: 'accepted', E: 'accepted' });
  assert.ok(state.logs.some(log => log.text.includes('no second download')));
  for (const id of ['A', 'B', 'D', 'E']) {
    assert.equal(state.logs.filter(log => log.text.startsWith(`Node ${id} adds`)).length, 1);
  }
  assert.equal(advanceSimulation(state, defaults), state);
});

test('threshold equality admits; raising policy cannot affect other nodes', () => {
  const accepted = finish({ ...defaults, feeRate: 5 });
  assert.equal(accepted.nodes.C, 'accepted');
  const denied = finish({ ...defaults, selectiveMinimum: 20 });
  assert.equal(denied.nodes.C, 'policy');
  assert.equal(denied.nodes.D, 'accepted');
  assert.equal(initialSimulation({ ...defaults, selectiveMinimum: 20 }).pools.C.length, 0);
});

test('missing input blocks C regardless of fee; disconnected E gets no admission', () => {
  const options = { ...defaults, feeRate: 100, missingAtC: true, offlineE: true };
  const state = finish(options);
  assert.equal(state.nodes.C, 'missing');
  assert.equal(state.nodes.E, 'offline');
  assert.equal(state.nodes.D, 'accepted');
  assert.equal(state.logs.filter(log => log.event.from === 'C').length, 0);
  assert.equal(state.logs.filter(log => log.event.from === 'E').length, 0);
});

test('fee competition affects just the selected mempool and respects its modeled minimum', () => {
  const initial = finish();
  const next = addCompetition(initial, 'C', 20);
  assert.equal(next.pools.C.length, initial.pools.C.length + 1);
  assert.equal(next.pools.C.at(-1).feeRate, 20);
  assert.equal(next.pools.A, initial.pools.A);
  assert.deepEqual(next.nodes, initial.nodes);
  assert.equal(addCompetition(finish({ ...defaults, offlineE: true }), 'E').competitors, 0);
});

test('reset recreates a clean starting world without changing existing state', () => {
  const settled = addCompetition(finish(), 'D');
  const reset = initialSimulation(defaults);
  assert.equal(reset.logs.length, 0);
  assert.equal(reset.competitors, 0);
  assert.equal(reset.nodes.A, 'unseen');
  assert.equal(settled.nodes.A, 'accepted');
  assert.equal(settled.competitors, 1);
});
