import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
async function url(name, dependencies = {}) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  for (const [name, uri] of Object.entries(dependencies)) outputText = outputText.replaceAll(`'./${name}'`, `'${uri}'`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const model = await import(await url('coinSelection', { comparisonMath: await url('comparisonMath') }));
const { WALLET_COINS: wallet, WALLET_ADDRESSES: addresses, fundingDraft } = await import(await url('coinSelectionExamples'));
const { newSession, editedSession } = await import(await url('transactionSession'));
const { quoteSelection: quote, selectCoins: select, estimatedVsize, SPEND_BUDGETS, parsePayment } = model;
const types = Object.keys(SPEND_BUDGETS);
const subsets = Array.from({ length: 256 }, (_, mask) => wallet.filter((_, i) => mask & (1 << i)));

test('all wallet subsets conserve value and cover the rounded fee budget', () => {
  for (const type of types) for (const rate of ['0.14', '5', '50']) for (const coins of subsets) {
    const q = quote(coins, 60000, rate, type);
    if (!q.funded) continue;
    assert.equal(q.total, q.payment + q.fee + q.change);
    assert.ok(q.fee >= Math.ceil(q.vsize * Number(rate)));
    assert.equal(q.hasChange, q.change >= q.dust);
    assert.equal(q.extraFee, q.hasChange ? 0 : q.fee - q.minimumFee);
  }
});
test('dust boundaries switch output count, preserve value, and include fees in shortfall', () => {
  for (const type of types) {
    const coin = wallet[0], dust = SPEND_BUDGETS[type].dust;
    const twoFee = estimatedVsize(type, 1, 2) * 5;
    const exact = quote([coin], coin.amount - twoFee - dust, '5', type);
    assert.equal(exact.change, dust); assert.equal(exact.hasChange, true);
    const below = quote([coin], exact.payment + 1, '5', type);
    assert.equal(below.hasChange, false); assert.equal(below.change, 0);
    assert.equal(below.vsize, estimatedVsize(type, 1, 1));
    assert.equal(below.fee, coin.amount - below.payment);
    const insufficient = quote([coin], coin.amount, '5', type);
    assert.equal(insufficient.shortfall, estimatedVsize(type, 1, 1) * 5);
    assert.equal(quote([coin], dust - 1, '5', type).funded, false);
  }
});
test('strategies attain their stated objective and avoid nonpositive effective coins when consolidating', () => {
  const before = JSON.stringify(wallet);
  for (const type of types) {
    const funded = subsets.map(coins => ({ coins, q: quote(coins, 60000, '5', type) })).filter(row => row.q.funded);
    const fewest = select(wallet, 60000, '5', type, 'fewest');
    assert.equal(fewest.length, Math.min(...funded.map(row => row.coins.length)));
    const change = select(wallet, 60000, '5', type, 'change');
    assert.equal(quote(change, 60000, '5', type).change, Math.min(...funded.map(row => row.q.change)));
    const consolidated = select(wallet, 60000, '50', type, 'consolidate');
    assert.equal(quote(consolidated, 60000, '50', type).uneconomic, 0);
    assert.ok(!consolidated.includes(wallet[7]));
    assert.deepEqual(select(wallet, 60000, '5', type, 'fewest'), fewest);
    assert.deepEqual(select(wallet, 1000000, '5', type, 'fewest'), []);
  }
  assert.equal(JSON.stringify(wallet), before);
});
test('invalid controls and duplicate outpoints cannot produce a funding plan', () => {
  for (const bad of ['', '0', '-1', '1.5', '1e3', ' 60000', '1000001']) assert.equal(parsePayment(bad), null);
  assert.equal(parsePayment('60000'), 60000);
  for (const bad of ['', 'NaN', '-1', '1001', '0', '1.12345']) assert.throws(() => quote([wallet[0]], 60000, bad, 'p2wpkh'));
  assert.throws(() => quote([wallet[0], wallet[0]], 60000, '5', 'p2wpkh'));
  assert.throws(() => quote([{ ...wallet[0], amount: 1.1 }], 60000, '5', 'p2wpkh'));
  assert.equal(quote([], 60000, '5', 'p2wpkh').funded, false);
});
test('handoff uses exact selected outpoints, fresh change, and clears stale budgets after editing', () => {
  for (const type of types) for (const network of ['mainnet', 'testnet']) {
    const coins = [wallet[1], wallet[2], wallet[3]], q = quote(coins, 60000, '5', type);
    const draft = fundingDraft(coins, q, type, network);
    assert.deepEqual(draft.inputs.map(i => [i.txid, Number(i.vout), Number(i.amount)]), coins.map(i => [i.txid, i.vout, i.amount]));
    assert.equal(draft.outputs[1].address, addresses[network][type]['5']);
    assert.ok(draft.inputs.every(i => i.source !== draft.outputs[1].address));
    const session = { ...newSession(draft), funding: { rate: '5', estimatedFee: q.fee, estimatedVsize: q.vsize, strategy: 'manual' } };
    assert.equal(editedSession(session, draft, network).funding, null);
  }
});
test('real Python signing executes every imported lock and stays within estimated size on both networks', () => {
  const vectors = [];
  for (const type of types) for (const network of ['mainnet', 'testnet']) for (const strategy of ['fewest', 'change', 'consolidate', 'no-change']) {
    const coins = strategy === 'no-change' ? [wallet[0]] : select(wallet, 60000, '5', type, strategy);
    const payment = strategy === 'no-change' ? wallet[0].amount - estimatedVsize(type, 1, 2) * 5 - SPEND_BUDGETS[type].dust + 1 : 60000;
    const q = quote(coins, payment, '5', type);
    vectors.push({ q, input: { kind: 'transaction', network, signTransaction: true, transaction: fundingDraft(coins, q, type, network) } });
  }
  const output = execFileSync('python3', ['tests/check_coin_signing.py'], { input: JSON.stringify(vectors), encoding: 'utf8', maxBuffer: 2 ** 20 });
  assert.equal(JSON.parse(output).checked, 32);
});
