import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function module(name) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { TOPICS, topicFor } = await module('navigation');
const { newSession, editedSession, preparationFor } = await module('transactionSession');
const draft = { spendType: 'p2pkh', inputs: [{ amount: '100000' }], outputs: [{ amount: '60000' }] };

test('every existing lesson has one menu home; transaction journey hashes keep their meaning', () => {
  const routes = TOPICS.flatMap(topic => topic.pages);
  assert.equal(new Set(routes).size, routes.length);
  assert.equal(routes.length, 16);
  assert.equal(topicFor('execution').id, 'scripts');
  for (const page of ['propagation', 'construction', 'mining', 'blocks']) assert.equal(topicFor(page).id, 'network');
  assert.equal(topicFor('coins').id, 'transactions');
  assert.equal(topicFor('tx-compare').id, 'transactions');
  assert.equal(topicFor('home'), undefined);
});

test('fresh direct entries prepare the required example rather than requiring earlier lessons', () => {
  const session = newSession(draft);
  for (const page of ['transaction', 'signing']) assert.equal(preparationFor(session, 'example', page), 'unsigned');
  for (const page of ['execution', 'propagation', 'construction', 'mining', 'blocks']) assert.equal(preparationFor(session, 'example', page), 'signed');
  const signed = { ...session, signedTrace: { transaction: { signing: {} } } };
  assert.equal(preparationFor(signed, 'example', 'blocks'), null);
});

test('editing an example creates a separate dirty journey and invalidates only its results', () => {
  const example = { ...newSession(draft), unsignedTrace: { marker: 'unsigned' }, signedTrace: { marker: 'signed' } };
  const snapshot = JSON.stringify(example);
  const changed = { ...draft, outputs: [{ amount: '59999' }] };
  const journey = editedSession(example, changed, 'testnet');
  assert.equal(JSON.stringify(example), snapshot);
  assert.equal(journey.draft, changed);
  assert.equal(journey.network, 'testnet');
  assert.equal(journey.authored, true);
  assert.equal(journey.signedTrace, null);
  assert.equal(journey.unsignedTrace, null);
  for (const page of ['transaction', 'signing', 'blocks']) assert.equal(preparationFor(journey, 'journey', page), null);
  // Even after explicitly building unsigned, later stages must never silently sign a user's draft.
  assert.equal(preparationFor({ ...journey, dirty: false, unsignedTrace: {} }, 'journey', 'blocks'), null);
});
