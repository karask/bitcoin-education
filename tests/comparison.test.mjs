import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/comparisonMath.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { comparisonFee } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('comparison fee quotes round fractional satoshis up without decimal artifacts', () => {
  assert.equal(comparisonFee(130, '5'), 650);
  assert.equal(comparisonFee(50, '0.14'), 7); // Binary multiplication gives 7.000000000000001.
  assert.equal(comparisonFee(141, '0.1'), 15);
  assert.equal(comparisonFee(190, '12.3456'), 2346);
  assert.equal(comparisonFee(365, '1000'), 365000);
  for (const rate of ['', '-1', '0', '1001', '1e2', 'Infinity', 'NaN', '0.0001', '2.12345']) assert.equal(comparisonFee(130, rate), null);
});
