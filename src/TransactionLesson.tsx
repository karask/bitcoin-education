import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { LessonTrace, Network, SighashType, TransactionDraft, TransactionPage } from './types';
import { CATALOG, TRANSACTION_ORDER } from './lessonCatalog';
import type { usePython } from './usePython';
import './transaction.css';
import { TransactionJourney } from './TransactionJourney';
import { BlockConstructionLesson } from './BlockConstructionLesson';
import { ScriptExecution } from './ScriptExecution';

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

export function TransactionLesson({ runtime, page, visible }: { runtime: ReturnType<typeof usePython>; page: TransactionPage; visible: boolean }) {
  const [network, setNetwork] = useState<Network>('mainnet');
  const [draft, setDraft] = useState<TransactionDraft>(() => example('mainnet'));
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState('tx-0');
  const [unsignedTrace, setUnsignedTrace] = useState<LessonTrace | null>(null);
  const [signedTrace, setSignedTrace] = useState<LessonTrace | null>(null);
  const [sighashPreview, setSighashPreview] = useState<LessonTrace['sighash'] | null>(null);
  const [explorerIndex, setExplorerIndex] = useState<number | null>(null);
  const started = useRef(false);
  const { calculate, invalidate } = runtime;
  useEffect(() => {
    if (!visible) return;
    if (page === 'transaction' && (!started.current || (!unsignedTrace && !dirty))) {
      calculate({ kind: 'transaction', transaction: draft, network, publicKey: '', compressed: true });
    }
    started.current = true;
    // Route changes restore a missing unsigned view once; edits require explicit build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, page, calculate]);
  useEffect(() => {
    if (runtime.trace?.sighash) { setSighashPreview(runtime.trace.sighash); return; }
    if (!runtime.trace?.transaction) return;
    if (runtime.trace.transaction.signing) setSignedTrace(runtime.trace);
    else setUnsignedTrace(runtime.trace);
  }, [runtime.trace]);
  useEffect(() => {
    if (!visible || page !== 'signing' || explorerIndex === null || runtime.status.state !== 'ready') return;
    setSighashPreview(null);
    calculate({ kind: 'transaction', previewSighash: true, transaction: draft, network, publicKey: '', compressed: true });
  }, [visible, page, explorerIndex, draft, network, runtime.status.state, calculate]);
  const trace = !dirty ? (page === 'transaction' ? unsignedTrace : signedTrace) : null;
  const data = trace?.transaction;
  const result = data ? trace?.steps[0] : null;
  const active = data?.fields.find((field) => field.id === selected) ?? data?.fields[0];
  function edit(next: TransactionDraft) { invalidate(); setDraft(next); setDirty(true); setUnsignedTrace(null); setSignedTrace(null); setSighashPreview(null); }
  function build(next = draft, net = network, signTransaction = false) {
    setSelected('tx-0'); setDirty(false);
    setSignedTrace(null);
    if (!signTransaction) setUnsignedTrace(null);
    calculate({ kind: 'transaction', transaction: next, network: net, publicKey: '', compressed: true, signTransaction });
  }
  function restore(sign = false) { setExplorerIndex(null); setSighashPreview(null); const next = example(network); setDraft(next); setUnsignedTrace(null); build(next, network, sign); }
  const sats = (amount: number) => amount.toLocaleString('en-US');

  return <div className="transaction-lesson">
    <section className="hero"><div className="hero-copy"><div className="hero-meta"><span className="chapter-tag">TRANSACTIONS / 0{TRANSACTION_ORDER.indexOf(page) + 1}</span><span>{CATALOG[page].tag}</span></div><h1>{CATALOG[page].title}<br /><span>{CATALOG[page].accent}</span></h1><p>{CATALOG[page].description}</p></div></section>
    <nav className="tx-page-path" aria-label="Transaction learning path">{TRANSACTION_ORDER.map((id, index) => <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined}><span>0{index + 1}</span>{CATALOG[id].nav}</a>)}</nav>

    {page === 'transaction' && <>
    <form className="tx-builder" onSubmit={(event) => { event.preventDefault(); build(); }}>
      <div className="tx-section-heading"><div><span className="section-index">01</span><h2>Build your transaction</h2></div><button type="button" className="text-button" onClick={() => restore()}><RotateCcw size={14} />Use example</button></div>
      <div className="tx-network"><label htmlFor="tx-network">Address network</label><select id="tx-network" value={network} onChange={(event) => { edit(draft); setNetwork(event.target.value as Network); }}><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select><span>Changing networks keeps your entries. Use example to load matching addresses.</span></div>
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
      {runtime.error && <p className="input-error" role="alert">{runtime.error}</p>}
      {dirty && <p className="draft-notice" role="status">Inputs changed. Build again to update the bytes and fee.</p>}
    </form></>}
    {page === 'signing' && <section className="input-card tx-signing-form" aria-label="Signing inputs">
      <div className="tx-section-heading"><h2>Authorize your transaction</h2><button type="button" className="text-button" onClick={() => restore(true)}>Use signed example</button></div>
      <p className="tx-context">{draft.inputs.length} inputs · {draft.outputs.length} outputs · {network}. Your transaction carries forward from Anatomy. <a href="#transaction">Edit UTXOs and outputs →</a></p>
      {draft.inputs.map((row, index) => {
        const change = (updates: Partial<typeof row>) => edit({ ...draft, inputs: draft.inputs.map((item, i) => i === index ? { ...item, ...updates } : item) });
        const mode = row.sighashType ?? 1;
        const preview = sighashPreview?.inputs[index];
        return <div key={index} className="tx-signing-input"><h3>Input {index + 1}</h3><code className="tx-selected-hex">{row.txid}:{row.vout}</code>
              <div className="tx-sighash-explorer"><button className="tx-sighash-toggle" type="button" aria-expanded={explorerIndex === index} onClick={() => setExplorerIndex(explorerIndex === index ? null : index)}><span>Explore signature scope</span><span className="tx-sighash-pill">{mode === 1 ? 'SIGHASH_ALL · all inputs + outputs' : `${(mode & 31) === 1 ? 'ALL' : (mode & 31) === 2 ? 'NONE' : 'SINGLE'}${mode & 128 ? ' + ANYONECANPAY' : ''}`}</span></button>
              {explorerIndex === index && <div className="tx-sighash-body"><p>Choose what this input signs. The preview below is calculated before the key is used.</p><div className="tx-sighash-controls"><label>Outputs to commit<select aria-label={`Input ${index + 1} SIGHASH mode`} value={mode & 31} onChange={(e) => change({ sighashType: (Number(e.target.value) | (mode & 128)) as SighashType })}><option value="1">ALL · every output</option><option value="2">NONE · no outputs</option><option value="3" disabled={index >= draft.outputs.length}>SINGLE · matching output</option></select></label><label className="tx-sighash-check"><input type="checkbox" aria-label={`Input ${index + 1} ANYONECANPAY`} checked={Boolean(mode & 128)} onChange={(e) => change({ sighashType: ((mode & 31) | (e.target.checked ? 128 : 0)) as SighashType })} />ANYONECANPAY · only this input</label></div>
              {index >= draft.outputs.length && <p className="tx-sighash-note">SINGLE is unavailable for input {index + 1}: add output {index + 1} in Anatomy first.</p>}
              {preview?.type === mode ? <><div className="tx-sighash-scope"><div><span>Version + locktime</span><strong>Committed</strong></div><div><span>Input outpoints</span><strong>{preview.inputScope}</strong></div><div><span>Input sequences</span><strong>{preview.sequenceScope}</strong></div><div><span>Outputs</span><strong>{preview.outputScope}</strong></div><div><span>Current input’s previous lock</span><strong>Inserted as scriptCode</strong></div><div><span>Previous input amounts</span><strong>Not committed in legacy P2PKH</strong></div></div><p className="tx-sighash-note">Other inputs’ scripts are empty in the signing copy. For NONE and SINGLE their sequences are zeroed; SINGLE uses null placeholders before its matching output. The four-byte mode is appended before double SHA-256.</p><div className="tx-sighash-digest"><span>Digest this input will sign</span><code>{preview.digest}</code></div><details><summary>Inspect exact signing preimage · {preview.preimage.length / 2} bytes</summary><code className="tx-selected-hex">{preview.preimage}</code></details></> : <p className="tx-sighash-note" role="status">{runtime.status.state !== 'ready' ? 'Waiting for browser Python…' : runtime.busy ? 'Calculating the signature scope in Python…' : runtime.error ?? 'Open the preview with valid transaction details.'}</p>}</div>}</div>
              <details className="tx-key-options" open><summary>Signing key & public-key format</summary><label>Learning private key · 32-byte hex<input aria-label={`Input ${index + 1} private key`} value={row.privateKey ?? ''} onChange={(e) => change({ privateKey: e.target.value })} placeholder="64 hex characters" autoComplete="off" spellCheck={false} /></label><label>Public-key format<select aria-label={`Input ${index + 1} public-key format`} value={row.compressed === false ? 'uncompressed' : 'compressed'} onChange={(e) => change({ compressed: e.target.value === 'compressed' })}><option value="compressed">Compressed · 33 bytes</option><option value="uncompressed">Uncompressed · 65 bytes</option></select></label><p className="tx-entry-note">The example key is the public number 1. Use disposable learning keys only. Keys stay in this browser and are included in the displayed and copied Python.</p></details>
        </div>;
      })}
      <section className="panel tx-sign-action" aria-label="Sign P2PKH transaction"><div><span className="output-kicker">NEXT / AUTHORIZE EACH INPUT</span><h3>Fill the empty scriptSigs.</h3><p>Sign every input with its matching key. By default, each signature commits to all input outpoints and sequences, all outputs, version, and locktime. Open a signature-scope explorer above to choose another mode. The library adds a signature and public key to each input. The example is ready to try with the public learning key 1.</p></div><button className="primary-button" type="button" disabled={runtime.busy || runtime.status.state !== 'ready'} onClick={() => build(draft, network, true)}>Sign P2PKH transaction<ArrowRight size={15} /></button></section>
    </section>}
    {page !== 'transaction' && runtime.error && <p className="input-error" role="alert">{runtime.error}</p>}
    {page === 'signing' && dirty && <p className="draft-notice">Inputs or signature scope changed. Sign to create a new result.</p>}
    {(['execution', 'propagation', 'construction', 'mining', 'blocks'].includes(page)) && !signedTrace && <section className="panel tx-stage-empty"><h2>Start with a signed transaction</h2><p>Continue from Signing, or load the public example to explore this lesson independently.</p><a className="secondary-button" href="#signing">Go to signing</a><button className="primary-button" disabled={runtime.busy || runtime.status.state !== 'ready'} onClick={() => restore(true)}>Use signed example</button></section>}

    {runtime.status.state !== 'ready' && <div className="tx-runtime panel" role="status"><p>{runtime.status.message}</p>{runtime.status.state === 'error' ? <button className="secondary-button" onClick={runtime.retry}>Restart Python</button> : <progress max="100" value={runtime.status.progress} aria-label="Loading Python" />}</div>}
    {(page === 'transaction' || page === 'signing') && data && result && active && <>
      <section className="tx-flow" aria-label="Transaction balance"><div><span>INPUT VALUE</span><strong>{sats(data.totalInput)} <small>sats</small></strong></div><span aria-hidden="true">−</span><div><span>OUTPUT VALUE</span><strong>{sats(data.totalOutput)} <small>sats</small></strong></div><span aria-hidden="true">=</span><div className="tx-fee"><span>IMPLIED FEE</span><strong data-testid="tx-fee">{sats(data.fee)} <small>sats</small></strong></div></section>
      <p className="tx-context">The fee depends on the previous amounts you supplied. It has no field in the transaction. {data.signing ? `This signed legacy transaction is ${result.byteLength} bytes / ${result.byteLength} vbytes. Its implied fee rate is ${(data.fee / result.byteLength).toFixed(2)} sat/vB.` : `This unsigned draft is ${result.byteLength} bytes; signatures will increase its size, so this is not a final fee-rate estimate.`}</p>
      {data.signing && <section className="panel tx-signing-results" aria-label="Signing walkthrough"><span className="output-kicker">FROM EMPTY INPUTS TO SIGNATURES</span><h2>What did we sign?</h2><p>For each input, the library creates a temporary transaction with empty scriptSigs, inserts that input’s previous locking script, applies its selected SIGHASH mode, appends the mode as four bytes, and double-SHA-256 hashes the serialization. This digest is signed; it is not the transaction ID.</p><p>The selected mode controls which inputs and outputs each signature commits to. Legacy P2PKH signing does not commit to previous input amounts. Changing a supplied amount can change the displayed fee without changing a signature.</p>{data.signing.inputs.map((item, index) => <details key={index} open={data.signing!.inputs.length === 1}><summary>Input {index + 1} · {item.sighashName} · digest → signature → scriptSig</summary><h4>Signing digest · 32 bytes</h4><code className="tx-selected-hex">{item.digest}</code><h4>Signature · DER + {item.sighashType.toString(16).padStart(2, '0')} ({item.sighashName})</h4><code className="tx-selected-hex">{item.signature}</code><h4>Public key · matched to the supplied P2PKH lock</h4><code className="tx-selected-hex">{item.publicKey}</code><h4>Unlocking script · two data pushes</h4><code className="tx-selected-hex">{item.scriptSig}</code></details>)}<p>The library created these signatures and the public keys match the supplied locks. This lab does not verify UTXOs on-chain or broadcast transactions.</p>{data.signing.inputs.some((item) => item.sighashType !== 1) ? <p className="tx-sighash-compat">The Script execution lesson’s educational evaluator currently supports SIGHASH_ALL only. You can inspect this alternate-mode signature and its bytes here; the evaluator will stop at its mode check.</p> : <p>Continue to Script execution to verify each input’s P2PKH script.</p>}<div className="tx-size-comparison"><span>Unsigned <strong>{data.signing.unsignedBytes} bytes</strong></span><ArrowRight size={20} /><span>Signed <strong>{result.byteLength} bytes</strong></span><span>Added <strong>{result.byteLength - data.signing.unsignedBytes} bytes</strong></span></div><h4>Signed transaction ID</h4><code className="tx-selected-hex" data-testid="signed-txid">{data.signing.txid}</code><p>Calculated from the signed serialization. Legacy scriptSigs are part of the TXID, so signing changes it.</p><details><summary>Compare the unsigned serialization and ID</summary><h4>Unsigned draft ID · not the signed TXID</h4><code className="tx-selected-hex">{data.signing.unsignedTxid}</code><h4>Unsigned hex</h4><code className="tx-selected-hex">{data.signing.unsignedHex}</code></details></section>}
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
    {signedTrace?.transaction?.signing && <>
      {visible && page === 'execution' && <ScriptExecution key={signedTrace.transaction.signing.txid} runtime={runtime} hex={signedTrace.steps[0].hex} scripts={signedTrace.transaction.previousScripts} />}
      <div hidden={page !== 'propagation'}><TransactionJourney key={signedTrace.transaction.signing.txid + ':' + signedTrace.transaction.fee} enabled={visible && page === 'propagation'} txid={signedTrace.transaction.signing.txid} hex={signedTrace.steps[0].hex} fee={signedTrace.transaction.fee} vsize={signedTrace.steps[0].byteLength} inputs={draft.inputs} scripts={signedTrace.transaction.previousScripts} /></div>
      <div hidden={page !== 'construction' && page !== 'mining' && page !== 'blocks'}><BlockConstructionLesson key={signedTrace.transaction.signing.txid + ':' + signedTrace.transaction.fee} page={page} runtime={runtime} hex={signedTrace.steps[0].hex} txid={signedTrace.transaction.signing.txid} fee={signedTrace.transaction.fee} vsize={signedTrace.steps[0].byteLength} network={network} /></div>
    </>}
    <div className="tx-next-page">{page === 'transaction' && unsignedTrace && !dirty && <a className="primary-button" href="#signing">Continue to signing<ArrowRight size={15} /></a>}{page === 'signing' && signedTrace && !dirty && <a className="primary-button" href="#execution">Verify with Script execution<ArrowRight size={15} /></a>}{page === 'execution' && signedTrace && <a className="primary-button" href="#propagation">Explore propagation<ArrowRight size={15} /></a>}{page === 'propagation' && signedTrace && <a className="primary-button" href="#construction">Build a candidate block<ArrowRight size={15} /></a>}{page === 'construction' && signedTrace && <a className="primary-button" href="#mining">Continue to mining<ArrowRight size={15} /></a>}{page === 'mining' && signedTrace && <a className="primary-button" href="#blocks">Follow the mined block<ArrowRight size={15} /></a>}</div>
    <div className="lesson-sources">Read the specification: <a href="https://developer.bitcoin.org/reference/transactions.html#raw-transaction-format" target="_blank" rel="noreferrer">Raw transaction format</a></div>
  </div>;
}
