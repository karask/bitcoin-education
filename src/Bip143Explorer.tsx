import { useState } from 'react';
import type { SighashPreview } from './types';

const descriptions: Record<string, string> = {
  version: 'Transaction version as a four-byte little-endian integer.',
  hashPrevouts: 'Double SHA-256 of all input outpoints, or 32 zero bytes with ANYONECANPAY.',
  hashSequence: 'Double SHA-256 of all input sequences for ALL without ANYONECANPAY; otherwise 32 zero bytes.',
  outpoint: 'This input’s previous TXID in internal byte order, followed by its four-byte little-endian output index.',
  scriptCode: 'CompactSize script length followed by the implied P2PKH script derived from this input’s witness program.',
  amount: 'The previous output amount for this input in satoshis, serialized as eight little-endian bytes.',
  sequence: 'This input’s four-byte sequence, committed directly in every supported mode.',
  hashOutputs: 'Double SHA-256 of all outputs for ALL, the matching output for SINGLE, or 32 zero bytes for NONE or an out-of-range SINGLE.',
  locktime: 'Transaction locktime as a four-byte little-endian integer.',
  sighashType: 'The selected SIGHASH mode as a four-byte little-endian integer. The signature stores only its one-byte form.',
};

export function Bip143Explorer({ preview }: { preview: SighashPreview['inputs'][number] }) {
  const [selected, setSelected] = useState('version');
  const trace = preview.bip143;
  if (!trace || !preview.preimage) return null;
  const field = trace.fields.find(item => item.name === selected) ?? trace.fields[0];
  const components = [
    { name: 'hashPrevouts', hash: trace.hashPrevouts, source: trace.prevouts_data },
    { name: 'hashSequence', hash: trace.hashSequence, source: trace.sequence_data },
    { name: 'hashOutputs', hash: trace.hashOutputs, source: trace.outputs_data },
  ];
  return <div className="bip143-explorer">
    {trace.single_output_out_of_range && <p className="tx-sighash-note">This input has no matching output. BIP143 SINGLE uses a zero hashOutputs and still calculates the normal preimage digest.</p>}
    <details>
      <summary>Inspect exact BIP143 preimage · {preview.preimage.length / 2} bytes</summary>
      <p>Choose a field to follow its bytes. Double SHA-256 of this complete preimage produces the digest above, checked against the library’s signer.</p>
      <div className="bip143-bytes" aria-label="BIP143 preimage fields">{trace.fields.map(item => <button type="button" key={item.name} className={field.name === item.name ? 'selected' : ''} aria-label={`${item.name} · bytes ${item.start}–${item.end - 1}`} aria-pressed={field.name === item.name} aria-describedby="bip143-field-description" onClick={() => setSelected(item.name)}><small>{item.name}</small><code>{item.hex}</code></button>)}</div>
      <div className="bip143-field-detail" id="bip143-field-description" aria-live="polite"><span className="output-kicker">BYTES {field.start}–{field.end - 1} · {field.size} B · ZERO-BASED</span><h4>{field.name}</h4><p>{descriptions[field.name]}</p><code className="tx-selected-hex">{field.hex}</code></div>
      <details><summary>Complete preimage hex</summary><code className="tx-selected-hex">{preview.preimage}</code></details>
    </details>
    <details><summary>Inspect the three component hashes</summary><p>A component disabled by a SIGHASH rule is 32 zero bytes. It is not the hash of empty data. Component hashes are shown in the byte order used in the preimage.</p>{components.map(component => <div className="bip143-component" key={component.name}><h4>{component.name}</h4><code className="tx-selected-hex">{component.hash}</code>{component.source === null ? <p>Zero by the selected SIGHASH rule; no serialized input is hashed.</p> : <><p>Double SHA-256 of these serialized bytes · {component.source.length / 2} B</p><code className="tx-selected-hex">{component.source || '(empty bytes)'}</code></>}</div>)}</details>
    <details><summary>Python for this BIP143 trace</summary><pre>{preview.python}</pre></details>
  </div>;
}
