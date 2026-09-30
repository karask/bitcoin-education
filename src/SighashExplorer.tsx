import type { SighashPreview, SighashType } from './types';
import { Bip143Explorer } from './Bip143Explorer';

type Props = {
  index: number; mode: SighashType; native: boolean; outputCount: number;
  expanded: boolean; toggle: () => void; change: (mode: SighashType) => void;
  preview?: SighashPreview['inputs'][number]; pendingMessage: string;
};

export function SighashExplorer({ index, mode, native, outputCount, expanded, toggle, change, preview, pendingMessage }: Props) {
  const base = mode & 31;
  const anyone = Boolean(mode & 128);
  const label = `${base === 1 ? 'ALL' : base === 2 ? 'NONE' : 'SINGLE'}${anyone ? ' + ANYONECANPAY' : ''}`;
  return <div className="tx-sighash-explorer">
    <button className="tx-sighash-toggle" type="button" aria-expanded={expanded} onClick={toggle}>
      <span>Explore signature scope</span><span className="tx-sighash-pill">{mode === 1 ? 'SIGHASH_ALL · all inputs + outputs' : label}</span>
    </button>
    {expanded && <div className="tx-sighash-body">
      <p>Choose what this input signs. The preview is calculated before the key is used.</p>
      <div className="tx-sighash-controls">
        <label>Outputs to commit<select aria-label={`Input ${index + 1} SIGHASH mode`} value={base} onChange={e => change((Number(e.target.value) | (mode & 128)) as SighashType)}>
          <option value="1">ALL · every output</option><option value="2">NONE · no outputs</option>
          <option value="3" disabled={!native && index >= outputCount}>SINGLE · matching output</option>
        </select></label>
        <label className="tx-sighash-check"><input type="checkbox" aria-label={`Input ${index + 1} ANYONECANPAY`} checked={anyone} onChange={e => change((base | (e.target.checked ? 128 : 0)) as SighashType)} />ANYONECANPAY · only this input</label>
      </div>
      {!native && index >= outputCount && <p className="tx-sighash-note">Legacy SINGLE needs output {index + 1}. Add it in Anatomy first.</p>}
      {preview?.type === mode ? <>
        <div className="tx-sighash-scope">
          <div><span>Version + locktime</span><strong>Committed</strong></div>
          <div><span>Input outpoints</span><strong>{preview.inputScope}</strong></div>
          <div><span>Input sequences</span><strong>{preview.sequenceScope}</strong></div>
          <div><span>Output amounts + locking scripts</span><strong>{preview.outputScope}</strong></div>
          <div><span>Current input’s scriptCode</span><strong>{native ? 'P2PKH-style script from the witness program' : 'Previous locking script'}</strong></div>
          <div><span>Previous input amounts</span><strong>{preview.amountScope}</strong></div>
        </div>
        <p className="tx-sighash-note">{native
          ? 'BIP143 hashes the chosen outpoints, sequences, and outputs into separate components. It also commits directly to this input’s outpoint, scriptCode, amount, and sequence. Witness signatures are excluded.'
          : 'Other inputs’ scripts are empty in the signing copy. For NONE and SINGLE their sequences are zeroed; SINGLE uses null placeholders before its matching output. The four-byte mode is appended before double SHA-256.'}</p>
        <div className="tx-sighash-digest"><span>{preview.algorithm} · digest this input will sign</span><code>{preview.digest}</code></div>
        <details><summary>Inspect this input’s scriptCode</summary><code className="tx-selected-hex">{preview.script}</code></details>
        {native ? <Bip143Explorer key={preview.digest} preview={preview} /> : preview.preimage && <details><summary>Inspect exact signing preimage · {preview.preimage.length / 2} bytes</summary><code className="tx-selected-hex">{preview.preimage}</code></details>}
      </> : <p className="tx-sighash-note" role="status">{pendingMessage}</p>}
    </div>}
  </div>;
}
