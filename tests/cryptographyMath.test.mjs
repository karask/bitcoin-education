import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/cryptographyMath.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const math = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { TOY, SECP_N, mod, inverse, toyPoints, addPoints, multiplyPoint, doubleAndAdd, toySign, toyVerify } = math;
const points = [null, ...toyPoints()];
const same = (a, b) => assert.deepEqual(a, b);
const identityKey = p => p === null ? 'O' : `${p.x},${p.y}`;
const membership = new Set(points.map(identityKey));

// Exhaustively verify the small field and group, independently of UI outputs.
test('prime-field inverses and the composite counterexample are correct', () => {
  assert.equal(mod(-1, 17), 16);
  assert.equal(inverse(0, 17), null);
  for (let a = 1; a < 17; a++) assert.equal((a * inverse(a, 17)) % 17, 1);
  assert.equal(inverse(6, 18), null);
  assert.equal(inverse(5, 17), 7);
});
test('the teaching curve is a group with 19 elements and generator order 19', () => {
  assert.equal(points.length, 19);
  assert.equal(membership.size, 19);
  for (const P of points) {
    same(addPoints(P, null), P);
    same(addPoints(P, P && { x: P.x, y: mod(-P.y, 17) }), null);
    for (const Q of points) {
      assert.ok(membership.has(identityKey(addPoints(P, Q))));
      same(addPoints(P, Q), addPoints(Q, P));
      for (const R of points) same(addPoints(addPoints(P, Q), R), addPoints(P, addPoints(Q, R)));
    }
  }
  const generated = new Set();
  let P = null;
  for (let count = 0; count < 19; count++) {
    same(multiplyPoint(count), P);
    generated.add(identityKey(P));
    P = addPoints(P, TOY.G);
  }
  assert.equal(generated.size, 19);
  same(P, null);
  same(multiplyPoint(20), TOY.G);
  same(multiplyPoint(2), { x: 6, y: 3 });
});
test('binary construction ends at the same point as sequential addition', () => {
  let sequential = null;
  for (let d = 1; d < 19; d++) {
    sequential = addPoints(sequential, TOY.G);
    same(doubleAndAdd(d).at(-1).result, sequential);
  }
});
test('every usable teaching signature verifies; nonce reuse recovers the selected secret', () => {
  for (let d = 1; d < 19; d++) for (let k = 1; k < 19; k++) for (let z = 0; z < 19; z++) {
    const first = toySign(d, z, k), second = toySign(d, (z + 1) % 19, k);
    const verification = toyVerify(multiplyPoint(d), z, first.r, first.s);
    assert.equal(verification.valid, first.valid);
    if (!first.valid || !second.valid) continue;
    const recoveredK = mod((z - ((z + 1) % 19)) * inverse(first.s - second.s, 19), 19);
    const recoveredD = mod((first.s * recoveredK - z) * inverse(first.r, 19), 19);
    assert.equal(recoveredK, k);
    assert.equal(recoveredD, d);
    assert.equal(toyVerify(multiplyPoint(d), z, first.r, 19 - first.s).valid, true);
  }
  assert.equal(toyVerify(null, 11, 10, 8).valid, false);
  assert.equal(toyVerify(TOY.G, 11, 0, 8).valid, false);
  assert.equal(toyVerify(TOY.G, 11, 10, 19).valid, false);
  assert.equal(SECP_N.toString(16), 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
});
