import type { TimelockOptions, TimelockMode, TimelockUnit } from './types';
export const TIMELOCK_MODES: { id: TimelockMode; title: string; description: string; layer: string }[] = [
  { id: 'locktime', title: 'Transaction locktime', description: 'An absolute limit chosen by the signer. The key-only output does not require it.', layer: 'nLockTime · absolute' },
  { id: 'sequence', title: 'Relative sequence', description: 'A delay from UTXO confirmation, chosen by the signer. The script does not require it.', layer: 'BIP68 · relative' },
  { id: 'cltv', title: 'Absolute script lock', description: 'The output requires a matching nLockTime before its key can spend it.', layer: 'CLTV · absolute' },
  { id: 'csv', title: 'Relative script lock', description: 'The output requires a matching nSequence delay before its key can spend it.', layer: 'CSV · relative' },
];
export function relativeMode(mode: TimelockMode) { return mode === 'sequence' || mode === 'csv'; }
export function matchingFields(options: TimelockOptions): TimelockOptions {
  const value = Number(options.value);
  return { ...options, version: '2', locktime: relativeMode(options.mode) ? '0' : options.value,
    sequence: relativeMode(options.mode) ? String(value + (options.unit === 'time' ? 2 ** 22 : 0)) : '4294967294' };
}
export function timelockScenario(mode: TimelockMode = 'cltv', unit?: TimelockUnit): TimelockOptions {
  const chosen = unit ?? (relativeMode(mode) ? 'blocks' : 'height');
  return matchingFields({ mode, unit: chosen, value: chosen === 'time' ? (relativeMode(mode) ? '169' : '1760000000') : relativeMode(mode) ? '144' : '900000',
    version: '2', locktime: '0', sequence: '4294967294', height: '900000', mtp: '1760000000', coinHeight: '899900', coinMtp: '1759914000' });
}
