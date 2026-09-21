import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { Network, TransactionDraft } from './types';
import type { usePython } from './usePython';
import './transaction.css';

const addresses = {
  mainnet: ['1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH', '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP'],
  testnet: ['mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', 'mg8Jz5776UdyiYcBb9Z873NTozEiADRW5H'],
};
function example(network: Network): TransactionDraft {
  return {
    inputs: [{ txid: '0123456789abcdef'.repeat(4), vout: '0', amount: '100000', sourceType: 'address', source: addresses[network][0], privateKey: '1'.padStart(64, '0'), compressed: true }],
    outputs: [{ address: addresses[network][1], amount: '60000' }, { address: addresses[network][0], amount: '39000' }],
  };
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState('');
  useEffect(() => { setMessage(''); }, [value]);
  return <button type="button" className="copy-button" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setMessage('Copied'); }
    catch { setMessage('Select text to copy'); }
  }}>{message === 'Copied' ? <Check size={14} /> : <Copy size={14} />}{message || label}</button>;
}

export function TransactionLesson({ runtime }: { runtime: ReturnType<typeof usePython> }) {
  const [network, setNetwork] = useState<Network>('mainnet');
  const [draft, setDraft] = useState<TransactionDraft>(() => example('mainnet'));
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState('tx-0');
  const { calculate, invalidate } = runtime;
  useEffect(() => {
    calculate({ kind: 'transaction', transaction: example('mainnet'), network: 'mainnet', publicKey: '', compressed: true });
  }, [calculate]);
  const trace = !dirty ? runtime.trace : null;
  const data = trace?.transaction;
  const result = data ? trace?.steps[0] : null;
  const active = data?.fields.find((field) => field.id === selected) ?? data?.fields[0];
  function edit(next: TransactionDraft) { invalidate(); setDraft(next); setDirty(true); }
  function build(next = draft, net = network, signTransaction = false) {
    setSelected('tx-0'); setDirty(false);
    calculate({ kind: 'transaction', transaction: next, network: net, publicKey: '', compressed: true, signTransaction });
  }
  function restore() { const next = example(network); setDraft(next); build(next); }
  const sats = (amount: number) => amount.toLocaleString('en-US');

  return <div className="transaction-lesson">
    <section className="hero"><div className="hero-copy"><div className="hero-meta"><span className="chapter-tag">TRANSACTIONS / 01</span><span>P2PKH · BUILD & SIGN</span></div><h1>A transaction,<br /><span>piece by piece.</span></h1><p>Choose the coins. Create the outputs. Sign and follow every byte.</p></div><div className="tx-hero-diagram" aria-hidden="true"><span>UTXOs</span><ArrowRight size={24} /><span>New outputs</span><small>the difference becomes the fee</small></div></section>

    <form className="tx-builder" onSubmit={(event) => { event.preventDefault(); build(); }}>
      <div className="tx-section-heading"><div><span className="section-index">01</span><h2>Build your transaction</h2></div><button type="button" className="text-button" onClick={restore}><RotateCcw size={14} />Use example</button></div>
      <div className="tx-network"><label htmlFor="tx-network">Address network</label><select id="tx-network" value={network} onChange={(event) => { invalidate(); setNetwork(event.target.value as Network); setDirty(true); }}><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select><span>Changing networks keeps your entries. Use example to load matching addresses.</span></div>
      <p className="tx-context">The example uses a fictional UTXO. Enter your own details below; existence, ownership, and unspent status are not checked. Building unsigned needs no private key.</p>
      <div className="tx-columns">
        <section className="panel tx-edit-panel" aria-label="Transaction inputs"><div className="tx-card-heading"><div><span className="output-kicker">SPEND EXISTING COINS</span><h3>Inputs <span>{draft.inputs.length}</span></h3></div><button className="text-button" type="button" disabled={draft.inputs.length >= 20} onClick={() => edit({ ...draft, inputs: [...draft.inputs, { txid: '', vout: '0', amount: '', source: '', sourceType: 'address' }] })}><Plus size={14} />Add UTXO</button></div>
          {draft.inputs.map((row, index) => {
            const change = (updates: Partial<typeof row>) => edit({ ...draft, inputs: draft.inputs.map((item, i) => i === index ? { ...item, ...updates } : item) });
            return <fieldset className="tx-entry" key={index}><legend>Input {index + 1}</legend><button className="icon-button tx-remove" type="button" aria-label={`Remove input ${index + 1}`} disabled={draft.inputs.length === 1} onClick={() => edit({ ...draft, inputs: draft.inputs.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
              <label>Previous transaction ID<input aria-label={`Input ${index + 1} transaction ID`} value={row.txid} onChange={(e) => change({ txid: e.target.value })} placeholder="64 hex characters · display order" spellCheck={false} autoComplete="off" /></label>
              <div className="tx-small-fields"><label>Output index (vout)<input aria-label={`Input ${index + 1} output index`} inputMode="numeric" value={row.vout} onChange={(e) => change({ vout: e.target.value })} /></label><label>Amount (satoshis)<input aria-label={`Input ${index + 1} amount`} inputMode="numeric" value={row.amount} onChange={(e) => change({ amount: e.target.value })} /></label></div>
              <label>Previous output identified by<select aria-label={`Input ${index + 1} source type`} value={row.sourceType} onChange={(e) => change({ sourceType: e.target.value as 'address' | 'script', source: '' })}><option value="address">P2PKH address</option><option value="script">P2PKH locking script (hex)</option></select></label>
              <label>{row.sourceType === 'address' ? 'Previous P2PKH address' : 'Previous scriptPubKey'}<input aria-label={`Input ${index + 1} previous lock`} value={row.source} onChange={(e) => change({ source: e.target.value })} placeholder={row.sourceType === 'address' ? 'Address that received this UTXO' : '76a914…88ac'} spellCheck={false} autoComplete="off" /></label>
              <p className="tx-entry-note">The amount and previous lock are context, not bytes in the new input.</p>
              <details className="tx-key-options"><summary>Signing key & public-key format</summary><label>Learning private key · 32-byte hex<input aria-label={`Input ${index + 1} private key`} value={row.privateKey ?? ''} onChange={(e) => change({ privateKey: e.target.value })} placeholder="64 hex characters" autoComplete="off" spellCheck={false} /></label><label>Public-key format<select aria-label={`Input ${index + 1} public-key format`} value={row.compressed === false ? 'uncompressed' : 'compressed'} onChange={(e) => change({ compressed: e.target.value === 'compressed' })}><option value="compressed">Compressed · 33 bytes</option><option value="uncompressed">Uncompressed · 65 bytes</option></select></label><p className="tx-entry-note">The example key is the public number 1. Use disposable learning keys only. Keys stay in this browser and are included in the displayed and copied Python.</p></details>
            </fieldset>;
          })}
        </section>
        <section className="panel tx-edit-panel" aria-label="Transaction outputs"><div className="tx-card-heading"><div><span className="output-kicker">CREATE NEW COINS</span><h3>Outputs <span>{draft.outputs.length}</span></h3></div><button className="text-button" type="button" disabled={draft.outputs.length >= 20} onClick={() => edit({ ...draft, outputs: [...draft.outputs, { address: '', amount: '' }] })}><Plus size={14} />Add output</button></div>
          {draft.outputs.map((row, index) => {
            const change = (updates: Partial<typeof row>) => edit({ ...draft, outputs: draft.outputs.map((item, i) => i === index ? { ...item, ...updates } : item) });
            return <fieldset className="tx-entry" key={index}><legend>Output {index + 1}</legend><button className="icon-button tx-remove" type="button" aria-label={`Remove output ${index + 1}`} disabled={draft.outputs.length === 1} onClick={() => edit({ ...draft, outputs: draft.outputs.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
              <label>Recipient or change address<input aria-label={`Output ${index + 1} address`} value={row.address} onChange={(e) => change({ address: e.target.value })} placeholder="P2PKH address" spellCheck={false} autoComplete="off" /></label>
              <label>Amount (satoshis)<input aria-label={`Output ${index + 1} amount`} inputMode="numeric" value={row.amount} onChange={(e) => change({ amount: e.target.value })} /></label>
            </fieldset>;
          })}
          <div className="tx-output-note"><strong>Change is an output, too.</strong><p>The example sends 60,000 sats and returns 39,000 sats as change. Nothing in the serialized transaction labels an output as “change”. Any unallocated value becomes the fee.</p></div>
        </section>
      </div>
      <div className="tx-build-actions"><button className="primary-button" type="submit" disabled={runtime.busy || runtime.status.state === 'error'}>{runtime.busy ? 'Building in Python…' : 'Build unsigned transaction'}<ArrowRight size={15} /></button><span>Version 2 · final sequences · locktime 0</span></div>
      <section className="panel tx-sign-action" aria-label="Sign P2PKH transaction"><div><span className="output-kicker">NEXT / AUTHORIZE EACH INPUT</span><h3>Fill the empty scriptSigs.</h3><p>Sign every input with its matching key using SIGHASH_ALL. The library adds a signature and public key to each input. The example is ready to try with the public learning key 1.</p></div><button className="primary-button" type="button" disabled={runtime.busy || runtime.status.state !== 'ready'} onClick={() => build(draft, network, true)}>Sign P2PKH transaction<ArrowRight size={15} /></button></section>
      {runtime.error && <p className="input-error" role="alert">{runtime.error}</p>}
      {dirty && <p className="draft-notice" role="status">Inputs changed. Build again to update the bytes and fee.</p>}
    </form>

    {runtime.status.state !== 'ready' && <div className="tx-runtime panel" role="status"><p>{runtime.status.message}</p>{runtime.status.state === 'error' ? <button className="secondary-button" onClick={runtime.retry}>Restart Python</button> : <progress max="100" value={runtime.status.progress} aria-label="Loading Python" />}</div>}
    {data && result && active && <>
      <section className="tx-flow" aria-label="Transaction balance"><div><span>INPUT VALUE</span><strong>{sats(data.totalInput)} <small>sats</small></strong></div><span aria-hidden="true">−</span><div><span>OUTPUT VALUE</span><strong>{sats(data.totalOutput)} <small>sats</small></strong></div><span aria-hidden="true">=</span><div className="tx-fee"><span>IMPLIED FEE</span><strong data-testid="tx-fee">{sats(data.fee)} <small>sats</small></strong></div></section>
      <p className="tx-context">The fee depends on the previous amounts you supplied. It has no field in the transaction. {data.signing ? `This signed legacy transaction is ${result.byteLength} bytes / ${result.byteLength} vbytes. Its implied fee rate is ${(data.fee / result.byteLength).toFixed(2)} sat/vB.` : `This unsigned draft is ${result.byteLength} bytes; signatures will increase its size, so this is not a final fee-rate estimate.`}</p>
      {data.signing && <section className="panel tx-signing-results" aria-label="Signing walkthrough"><span className="output-kicker">FROM EMPTY INPUTS TO SIGNATURES</span><h2>What did we sign?</h2><p>For each input, the library creates a temporary transaction with empty scriptSigs, then inserts that input’s previous locking script in its place. It appends SIGHASH_ALL as four bytes and double-SHA-256 hashes that serialization. This digest is signed; it is not the transaction ID.</p><p>SIGHASH_ALL commits to all outpoints, sequences, outputs, version, and locktime. Legacy P2PKH signing does not commit to previous input amounts. Changing a supplied amount can change the displayed fee without changing a signature.</p>{data.signing.inputs.map((item, index) => <details key={index} open={data.signing!.inputs.length === 1}><summary>Input {index + 1} · digest → signature → scriptSig</summary><h4>Signing digest · 32 bytes</h4><code className="tx-selected-hex">{item.digest}</code><h4>Signature · DER + 01 (SIGHASH_ALL)</h4><code className="tx-selected-hex">{item.signature}</code><h4>Public key · matched to the supplied P2PKH lock</h4><code className="tx-selected-hex">{item.publicKey}</code><h4>Unlocking script · two data pushes</h4><code className="tx-selected-hex">{item.scriptSig}</code></details>)}<p>The library created these signatures and the public keys match the supplied locks. This lab does not execute Script, verify UTXOs on-chain, or broadcast transactions.</p><div className="tx-size-comparison"><span>Unsigned <strong>{data.signing.unsignedBytes} bytes</strong></span><ArrowRight size={20} /><span>Signed <strong>{result.byteLength} bytes</strong></span><span>Added <strong>{result.byteLength - data.signing.unsignedBytes} bytes</strong></span></div><h4>Signed transaction ID</h4><code className="tx-selected-hex" data-testid="signed-txid">{data.signing.txid}</code><p>Calculated from the signed serialization. Legacy scriptSigs are part of the TXID, so signing changes it.</p><details><summary>Compare the unsigned serialization and ID</summary><h4>Unsigned draft ID · not the signed TXID</h4><code className="tx-selected-hex">{data.signing.unsignedTxid}</code><h4>Unsigned hex</h4><code className="tx-selected-hex">{data.signing.unsignedHex}</code></details></section>}
      <section className="panel tx-inspection" aria-label="Transaction hex explorer"><div className="tx-card-heading"><div><span className="output-kicker">02 / FOLLOW THE BYTES</span><h2>{data.signing ? 'The signed transaction' : 'The unsigned transaction'}</h2></div><CopyValue value={result.hex} label="Copy transaction hex" /></div><p className="tx-context">Click, hover, or focus a colored field. {data.signing ? 'Explore the signature push, DER signature, sighash byte, public-key push, and public key inside each scriptSig.' : 'Empty scriptSigs occupy zero bytes and appear only in the field list. This draft cannot spend these P2PKH outputs until signed.'}</p>
        <div className="hex-output tx-hex" data-testid="transaction-hex" aria-label={`${data.signing ? 'Signed' : 'Unsigned'} transaction hexadecimal`}>{data.fields.filter((field) => field.end > field.start).map((field) => <button type="button" key={field.id} className={`byte-field tx-color-${field.category} ${active.id === field.id ? 'inspected' : ''}`} onClick={() => setSelected(field.id)} onMouseEnter={() => setSelected(field.id)} onFocus={() => setSelected(field.id)} aria-label={field.label} aria-pressed={active.id === field.id} aria-describedby="tx-field-description">{result.hex.slice(field.start * 2, field.end * 2).match(/.{2}/g)?.map((byte, i) => <span className="hex-byte" key={i}>{byte}</span>)}</button>)}</div>
        <div className="tx-explorer-grid"><div className="tx-field-list" aria-label="Transaction fields">{data.fields.map((field) => <button type="button" key={field.id} className={`tx-field-item tx-color-${field.category} ${active.id === field.id ? 'selected' : ''}`} onClick={() => setSelected(field.id)} onFocus={() => setSelected(field.id)} aria-pressed={active.id === field.id}><span className="legend-dot" /><span>{field.label}</span><small>{field.end - field.start} B</small></button>)}</div>
          <div className={`tx-detail tx-color-${active.category}`} id="tx-field-description" aria-live="polite"><span className="output-kicker">{active.end === active.start ? `INSERTION POINT ${active.start} · NO BYTES` : `BYTES ${active.start}–${active.end - 1} · ZERO-BASED`}</span><h3>{active.label}</h3><p>{active.description}</p><code className="tx-selected-hex">{result.hex.slice(active.start * 2, active.end * 2) || '(empty)'}</code><h4>Created by this Python</h4><pre>{active.python}</pre></div>
        </div>
      </section>
      <details className="panel tx-python"><summary>View & copy the complete Python example</summary><p>These are the exact construction calls executed by python-bitcoin-utils in your browser.</p><CopyValue value={data.python} label="Copy Python" /><pre>{data.python}</pre></details>
      <details className="panel tx-python"><summary>Inspect the previous locking scripts</summary><p>These describe the UTXOs being spent. They enter the signing digest calculation, not the final scriptSigs.</p>{data.previousScripts.map((script, i) => <div key={i}><h4>Input {i + 1} · previous scriptPubKey</h4><code className="tx-selected-hex">{script}</code></div>)}</details>
      <div className="insight"><div><strong>Try changing just one thing.</strong><p>Reduce the change amount by 1 satoshi: the fee rises by 1. Edit a vout and look for its four little-endian bytes. Add another input to see a second outpoint, empty scriptSig, and sequence.</p></div></div>
    </>}
    <div className="lesson-sources">Read the specification: <a href="https://developer.bitcoin.org/reference/transactions.html#raw-transaction-format" target="_blank" rel="noreferrer">Raw transaction format</a></div>
  </div>;
}
