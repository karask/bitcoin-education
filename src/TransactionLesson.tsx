import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { LessonTrace, Network, SpendType, TransactionDraft, TransactionPage } from './types';
import { CATALOG, TRANSACTION_ORDER } from './lessonCatalog';
import type { usePython } from './usePython';
import './transaction.css';
import { TransactionJourney } from './TransactionJourney';
import { BlockConstructionLesson } from './BlockConstructionLesson';
import { ScriptExecution } from './ScriptExecution';
import { SighashExplorer } from './SighashExplorer';
import { SigningWalkthrough } from './SigningWalkthrough';

const addresses = {
  mainnet: ['1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH', '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP'],
  testnet: ['mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', 'mg8Jz5776UdyiYcBb9Z873NTozEiADRW5H'],
};
const nativeAddresses = {
  mainnet: ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'bc1qq6hag67dl53wl99vzg42z8eyzfz2xlkvxechjp'],
  testnet: ['tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'tb1qq6hag67dl53wl99vzg42z8eyzfz2xlkvvlryfj'],
};
function example(network: Network, spendType: SpendType): TransactionDraft {
  const chosen = spendType === 'p2wpkh' ? nativeAddresses : addresses;
  return { spendType,
    inputs: [{ txid: '0123456789abcdef'.repeat(4), vout: '0', amount: '100000', sourceType: 'address', source: chosen[network][0], privateKey: '1'.padStart(64, '0'), compressed: true }],
    outputs: [{ address: chosen[network][1], amount: '60000' }, { address: chosen[network][0], amount: '39000' }],
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

type LessonProps = { runtime: ReturnType<typeof usePython>; page: TransactionPage; visible: boolean };
const SPEND_EXAMPLES: { type: SpendType; label: string; description: string }[] = [
  { type: 'p2pkh', label: 'Legacy P2PKH', description: 'Signatures in scriptSig' },
  { type: 'p2wpkh', label: 'Native P2WPKH', description: 'Signatures in witness' },
];

export function TransactionLesson({ runtime, page, visible }: LessonProps) {
  const [spendType, setSpendType] = useState<SpendType>('p2pkh');
  return <div className="transaction-lesson">
    <section className="hero"><div className="hero-copy"><div className="hero-meta"><span className="chapter-tag">TRANSACTIONS / 0{TRANSACTION_ORDER.indexOf(page) + 1}</span><span>{spendType.toUpperCase()}</span></div><h1>{CATALOG[page].title}<br /><span>{CATALOG[page].accent}</span></h1><p>{CATALOG[page].description}</p></div></section>
    <nav className="tx-page-path" aria-label="Transaction learning path">{TRANSACTION_ORDER.map((id, index) => <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined}><span>0{index + 1}</span>{CATALOG[id].nav}</a>)}</nav>
    <section className="tx-spend-selector" aria-label="Spend example"><div><span className="output-kicker">SPEND EXAMPLE</span><p>Follow the same journey with a different spending condition.</p></div><div className="tx-spend-options" role="group" aria-label="Choose spend example">{SPEND_EXAMPLES.map(item => <button key={item.type} type="button" aria-pressed={spendType === item.type} className={spendType === item.type ? 'selected' : ''} onClick={() => { if (item.type !== spendType) { runtime.invalidate(); setSpendType(item.type); } }}><strong>{item.label}</strong><span>{item.description}</span></button>)}</div><small>Each example keeps its own draft and results while this page is open.</small></section>
    {SPEND_EXAMPLES.map(item => <div key={item.type} hidden={spendType !== item.type} data-spend-example={item.type}><SpendLesson runtime={runtime} page={page} visible={visible && spendType === item.type} spendType={item.type} /></div>)}
  </div>;
}

function SpendLesson({ runtime, page, visible, spendType }: LessonProps & { spendType: SpendType }) {
  const native = spendType === 'p2wpkh';
  const spendLabel = native ? 'P2WPKH' : 'P2PKH';
  const [network, setNetwork] = useState<Network>('mainnet');
  const [draft, setDraft] = useState<TransactionDraft>(() => example('mainnet', spendType));
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
    if (!visible) return;
    if (runtime.trace?.sighash?.spendType === spendType) { setSighashPreview(runtime.trace.sighash); return; }
    if (runtime.trace?.transaction?.spendType !== spendType) return;
    if (runtime.trace.transaction.signing) setSignedTrace(runtime.trace);
    else setUnsignedTrace(runtime.trace);
  }, [runtime.trace, visible, spendType]);
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
  function restore(sign = false) { setExplorerIndex(null); setSighashPreview(null); const next = example(network, spendType); setDraft(next); setUnsignedTrace(null); build(next, network, sign); }
  const sats = (amount: number) => amount.toLocaleString('en-US');

  return <div className="tx-spend-lesson">
    {page === 'transaction' && <>
    <form className="tx-builder" onSubmit={(event) => { event.preventDefault(); build(); }}>
      <div className="tx-section-heading"><div><span className="section-index">01</span><h2>Build your transaction</h2></div><button type="button" className="text-button" onClick={() => restore()}><RotateCcw size={14} />Use example</button></div>
      <div className="tx-network"><label htmlFor={`tx-network-${spendType}`}>Address network</label><select id={`tx-network-${spendType}`} value={network} onChange={(event) => { edit(draft); setNetwork(event.target.value as Network); }}><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select><span>Changing networks keeps your entries. Use example to load matching addresses.</span></div>
      <p className="tx-context">The example uses a fictional UTXO. Enter your own details below; existence, ownership, and unspent status are not checked. Building unsigned needs no private key.</p>
      {native && <aside className="tx-native-anatomy"><strong>Witness data gets its own section.</strong><div className="tx-serialization-path"><span>Version</span><span className="witness">Marker + flag</span><span>Inputs</span><span>Outputs</span><span className="witness">Witness stacks</span><span>Locktime</span></div><p>The unsigned bytes below use base serialization with empty scriptSigs. Signing adds marker 00, flag 01, and a witness stack for every input. Those fields affect WTXID and weight; TXID excludes them.</p></aside>}
      <div className="tx-columns">
        <section className="panel tx-edit-panel" aria-label="Transaction inputs"><div className="tx-card-heading"><div><span className="output-kicker">SPEND EXISTING COINS</span><h3>Inputs <span>{draft.inputs.length}</span></h3></div><button className="text-button" type="button" disabled={draft.inputs.length >= 20} onClick={() => edit({ ...draft, inputs: [...draft.inputs, { txid: '', vout: '0', amount: '', source: '', sourceType: 'address' }] })}><Plus size={14} />Add UTXO</button></div>
          {draft.inputs.map((row, index) => {
            const change = (updates: Partial<typeof row>) => edit({ ...draft, inputs: draft.inputs.map((item, i) => i === index ? { ...item, ...updates } : item) });
            return <fieldset className="tx-entry" key={index}><legend>Input {index + 1}</legend><button className="icon-button tx-remove" type="button" aria-label={`Remove input ${index + 1}`} disabled={draft.inputs.length === 1} onClick={() => edit({ ...draft, inputs: draft.inputs.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
              <label>Previous transaction ID<input aria-label={`Input ${index + 1} transaction ID`} value={row.txid} onChange={(e) => change({ txid: e.target.value })} placeholder="64 hex characters · display order" spellCheck={false} autoComplete="off" /></label>
              <div className="tx-small-fields"><label>Output index (vout)<input aria-label={`Input ${index + 1} output index`} inputMode="numeric" value={row.vout} onChange={(e) => change({ vout: e.target.value })} /></label><label>Amount (satoshis)<input aria-label={`Input ${index + 1} amount`} inputMode="numeric" value={row.amount} onChange={(e) => change({ amount: e.target.value })} /></label></div>
              <label>Previous output identified by<select aria-label={`Input ${index + 1} source type`} value={row.sourceType} onChange={(e) => change({ sourceType: e.target.value as 'address' | 'script', source: '' })}><option value="address">{spendLabel} address</option><option value="script">{spendLabel} locking script (hex)</option></select></label>
              <label>{row.sourceType === 'address' ? `Previous ${spendLabel} address` : 'Previous scriptPubKey'}<input aria-label={`Input ${index + 1} previous lock`} value={row.source} onChange={(e) => change({ source: e.target.value })} placeholder={row.sourceType === 'address' ? 'Address that received this UTXO' : native ? '0014…' : '76a914…88ac'} spellCheck={false} autoComplete="off" /></label>
              <p className="tx-entry-note">The amount and previous lock are context, not bytes in the new input.</p>
            </fieldset>;
          })}
        </section>
        <section className="panel tx-edit-panel" aria-label="Transaction outputs"><div className="tx-card-heading"><div><span className="output-kicker">CREATE NEW COINS</span><h3>Outputs <span>{draft.outputs.length}</span></h3></div><button className="text-button" type="button" disabled={draft.outputs.length >= 20} onClick={() => edit({ ...draft, outputs: [...draft.outputs, { address: '', amount: '' }] })}><Plus size={14} />Add output</button></div>
          {draft.outputs.map((row, index) => {
            const change = (updates: Partial<typeof row>) => edit({ ...draft, outputs: draft.outputs.map((item, i) => i === index ? { ...item, ...updates } : item) });
            return <fieldset className="tx-entry" key={index}><legend>Output {index + 1}</legend><button className="icon-button tx-remove" type="button" aria-label={`Remove output ${index + 1}`} disabled={draft.outputs.length === 1} onClick={() => edit({ ...draft, outputs: draft.outputs.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
              <label>Recipient or change address<input aria-label={`Output ${index + 1} address`} value={row.address} onChange={(e) => change({ address: e.target.value })} placeholder={`${spendLabel} address`} spellCheck={false} autoComplete="off" /></label>
              <label>Amount (satoshis)<input aria-label={`Output ${index + 1} amount`} inputMode="numeric" value={row.amount} onChange={(e) => change({ amount: e.target.value })} /></label>
            </fieldset>;
          })}
          <div className="tx-output-note"><strong>Change is an output, too.</strong><p>The example sends 60,000 sats and returns 39,000 sats as change. Nothing in the serialized transaction labels an output as “change”. Any unallocated value becomes the fee.</p><p>This example uses {spendLabel} outputs. Real transactions can mix output types, independently of how their inputs are spent.</p></div>
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
              <SighashExplorer index={index} mode={mode} native={native} outputCount={draft.outputs.length} expanded={explorerIndex === index} toggle={() => setExplorerIndex(explorerIndex === index ? null : index)} change={sighashType => change({ sighashType })} preview={preview} pendingMessage={runtime.status.state !== 'ready' ? 'Waiting for browser Python…' : runtime.busy ? 'Calculating the signature scope in Python…' : runtime.error ?? 'Open the preview with valid transaction details.'} />
              <details className="tx-key-options" open><summary>Signing key & public-key format</summary><label>Learning private key · 32-byte hex<input aria-label={`Input ${index + 1} private key`} value={row.privateKey ?? ''} onChange={(e) => change({ privateKey: e.target.value })} placeholder="64 hex characters" autoComplete="off" spellCheck={false} /></label><label>Public-key format<select aria-label={`Input ${index + 1} public-key format`} value={row.compressed === false ? 'uncompressed' : 'compressed'} onChange={(e) => change({ compressed: e.target.value === 'compressed' })}><option value="compressed">Compressed · 33 bytes</option>{!native && <option value="uncompressed">Uncompressed · 65 bytes</option>}</select></label><p className="tx-entry-note">The example key is the public number 1. Use disposable learning keys only. Keys stay in this browser and are included in the displayed and copied Python.</p></details>
        </div>;
      })}
      <section className="panel tx-sign-action" aria-label={`Sign ${spendLabel} transaction`}><div><span className="output-kicker">NEXT / AUTHORIZE EACH INPUT</span><h3>{native ? 'Fill the witness stacks.' : 'Fill the empty scriptSigs.'}</h3><p>Sign every input with its matching key. By default, each signature commits to all input outpoints and sequences, all outputs, version, and locktime. Open a signature-scope explorer above to choose another mode. {native ? 'BIP143 also commits to the amount of the input being signed. The library adds a signature and compressed public key to each witness stack.' : 'The library adds a signature and public key to each input’s scriptSig.'} The example uses public learning key 1.</p></div><button className="primary-button" type="button" disabled={runtime.busy || runtime.status.state !== 'ready'} onClick={() => build(draft, network, true)}>Sign {spendLabel} transaction<ArrowRight size={15} /></button></section>
    </section>}
    {page !== 'transaction' && runtime.error && <p className="input-error" role="alert">{runtime.error}</p>}
    {page === 'signing' && dirty && <p className="draft-notice">Inputs or signature scope changed. Sign to create a new result.</p>}
    {(['execution', 'propagation', 'construction', 'mining', 'blocks'].includes(page)) && !signedTrace && <section className="panel tx-stage-empty"><h2>Start with a signed transaction</h2><p>Continue from Signing, or load the public example to explore this lesson independently.</p><a className="secondary-button" href="#signing">Go to signing</a><button className="primary-button" disabled={runtime.busy || runtime.status.state !== 'ready'} onClick={() => restore(true)}>Use signed example</button></section>}

    {runtime.status.state !== 'ready' && <div className="tx-runtime panel" role="status"><p>{runtime.status.message}</p>{runtime.status.state === 'error' ? <button className="secondary-button" onClick={runtime.retry}>Restart Python</button> : <progress max="100" value={runtime.status.progress} aria-label="Loading Python" />}</div>}
    {(page === 'transaction' || page === 'signing') && data && result && active && <>
      <section className="tx-flow" aria-label="Transaction balance"><div><span>INPUT VALUE</span><strong>{sats(data.totalInput)} <small>sats</small></strong></div><span aria-hidden="true">−</span><div><span>OUTPUT VALUE</span><strong>{sats(data.totalOutput)} <small>sats</small></strong></div><span aria-hidden="true">=</span><div className="tx-fee"><span>IMPLIED FEE</span><strong data-testid="tx-fee">{sats(data.fee)} <small>sats</small></strong></div></section>
      <p className="tx-context">The fee depends on the previous amounts you supplied. It has no field in the transaction. {data.signing ? `This signed transaction is ${data.totalSize} bytes / ${data.weight} weight units / ${data.vsize} vbytes. Its implied fee rate is ${(data.fee / data.vsize).toFixed(2)} sat/vB.` : `This unsigned draft is ${result.byteLength} bytes; signatures will increase its size, so this is not a final fee-rate estimate.`}</p>
      {data.signing && <SigningWalkthrough data={data} />}
      <section className="panel tx-inspection" aria-label="Transaction hex explorer"><div className="tx-card-heading"><div><span className="output-kicker">02 / FOLLOW THE BYTES</span><h2>{data.signing ? 'The signed transaction' : 'The unsigned transaction'}</h2></div><CopyValue value={result.hex} label="Copy transaction hex" /></div><p className="tx-context">Click, hover, or focus a colored field. {data.signing ? native ? 'Explore the marker, flag, witness item counts and lengths, signature, and public key. Witness lengths are CompactSize values, not script push opcodes.' : 'Explore the signature push, DER signature, sighash byte, public-key push, and public key inside each scriptSig.' : native ? 'Native scriptSigs stay empty. This unsigned base serialization has no witness data yet.' : 'Empty scriptSigs occupy zero bytes and appear only in the field list. This draft needs signatures before it can spend the outputs.'}</p>
        <div className="hex-output tx-hex" data-testid="transaction-hex" aria-label={`${data.signing ? 'Signed' : 'Unsigned'} transaction hexadecimal`}>{data.fields.filter((field) => field.end > field.start).map((field) => <button type="button" key={field.id} className={`byte-field tx-color-${field.category} ${active.id === field.id ? 'inspected' : ''}`} onClick={() => setSelected(field.id)} onMouseEnter={() => setSelected(field.id)} onFocus={() => setSelected(field.id)} aria-label={field.label} aria-pressed={active.id === field.id} aria-describedby={`tx-field-description-${spendType}`}>{result.hex.slice(field.start * 2, field.end * 2).match(/.{2}/g)?.map((byte, i) => <span className="hex-byte" key={i}>{byte}</span>)}</button>)}</div>
        <div className="tx-explorer-grid"><div className="tx-field-list" aria-label="Transaction fields">{data.fields.map((field) => <button type="button" key={field.id} className={`tx-field-item tx-color-${field.category} ${active.id === field.id ? 'selected' : ''}`} onClick={() => setSelected(field.id)} onFocus={() => setSelected(field.id)} aria-pressed={active.id === field.id}><span className="legend-dot" /><span>{field.label}</span><small>{field.end - field.start} B</small></button>)}</div>
          <div className={`tx-detail tx-color-${active.category}`} id={`tx-field-description-${spendType}`} aria-live="polite"><span className="output-kicker">{active.end === active.start ? `INSERTION POINT ${active.start} · NO BYTES` : `BYTES ${active.start}–${active.end - 1} · ZERO-BASED`}</span><h3>{active.label}</h3><p>{active.description}</p><code className="tx-selected-hex">{result.hex.slice(active.start * 2, active.end * 2) || '(empty)'}</code><h4>Created by this Python</h4><pre>{active.python}</pre></div>
        </div>
      </section>
      <details className="panel tx-python"><summary>View & copy the complete Python example</summary><p>These are the exact construction calls executed by python-bitcoin-utils in your browser.</p><CopyValue value={data.python} label="Copy Python" /><pre>{data.python}</pre></details>
      <details className="panel tx-python"><summary>Inspect the previous locking scripts</summary><p>These describe the UTXOs being spent. {native ? 'BIP143 uses a P2PKH-style scriptCode derived from each witness program; it is shown in the Sighash explorer.' : 'They enter the signing digest calculation, not the final scriptSigs.'}</p>{data.previousScripts.map((script, i) => <div key={i}><h4>Input {i + 1} · previous scriptPubKey</h4><code className="tx-selected-hex">{script}</code></div>)}</details>
      <div className="insight"><div><strong>Try changing just one thing.</strong><p>Reduce the change amount by 1 satoshi: the fee rises by 1. Edit a vout and look for its four little-endian bytes. Add another input to see a second outpoint, empty scriptSig, and sequence.</p></div></div>
    </>}
    {signedTrace?.transaction?.signing && <>
      {native && page === 'execution' && <section className="panel tx-stage-empty"><span className="output-kicker">NATIVE P2WPKH · EXECUTION</span><h2>Witness execution is the next walkthrough.</h2><p>The signature and public key are in the witness stack. The previous output’s version-0 program selects the P2WPKH validation rules, which use the BIP143 digest and the previous amount.</p><p>The interactive execution walkthrough currently covers Legacy P2PKH. This native example does not display an execution result yet. You can continue with the signed bytes in the propagation simulation.</p></section>}
      {native && ['construction', 'mining', 'blocks'].includes(page) && <section className="panel tx-stage-empty"><span className="output-kicker">NATIVE P2WPKH · BLOCK CONSTRUCTION</span><h2>A witness commitment comes before mining.</h2><p>A block containing this transaction must commit to the witness data through its coinbase. This screen currently constructs candidates for the Legacy P2PKH example.</p><p>The native witness-commitment walkthrough will connect this example to candidate construction, mining, and block relay. The Legacy P2PKH example has the complete shared flow.</p><a className="secondary-button" href="#propagation">Return to propagation</a></section>}
      {visible && page === 'execution' && !native && <ScriptExecution key={signedTrace.transaction.wtxid} runtime={runtime} hex={signedTrace.steps[0].hex} scripts={signedTrace.transaction.previousScripts} />}
      <div hidden={page !== 'propagation'}><TransactionJourney wtxid={signedTrace.transaction.wtxid} hasWitness={signedTrace.transaction.hasWitness} weight={signedTrace.transaction.weight} key={signedTrace.transaction.wtxid + ':' + signedTrace.transaction.fee} enabled={visible && page === 'propagation'} txid={signedTrace.transaction.signing.txid} hex={signedTrace.steps[0].hex} fee={signedTrace.transaction.fee} vsize={signedTrace.transaction.vsize} inputs={draft.inputs} scripts={signedTrace.transaction.previousScripts} /></div>
      {!native && <div hidden={page !== 'construction' && page !== 'mining' && page !== 'blocks'}><BlockConstructionLesson enabled={visible} key={signedTrace.transaction.wtxid + ':' + signedTrace.transaction.fee} page={page} runtime={runtime} hex={signedTrace.steps[0].hex} txid={signedTrace.transaction.signing.txid} fee={signedTrace.transaction.fee} vsize={signedTrace.transaction.vsize} network={network} /></div>}
    </>}
    <div className="tx-next-page">{page === 'transaction' && unsignedTrace && !dirty && <a className="primary-button" href="#signing">Continue to signing<ArrowRight size={15} /></a>}{page === 'signing' && signedTrace && !dirty && <a className="primary-button" href="#execution">{native ? 'About witness execution' : 'Verify with Script execution'}<ArrowRight size={15} /></a>}{page === 'execution' && signedTrace && <a className="primary-button" href="#propagation">Explore propagation<ArrowRight size={15} /></a>}{page === 'propagation' && signedTrace && !native && <a className="primary-button" href="#construction">Build a candidate block<ArrowRight size={15} /></a>}{page === 'construction' && signedTrace && !native && <a className="primary-button" href="#mining">Continue to mining<ArrowRight size={15} /></a>}{page === 'mining' && signedTrace && !native && <a className="primary-button" href="#blocks">Follow the mined block<ArrowRight size={15} /></a>}</div>
    <div className="lesson-sources">Read the specification: <a href="https://developer.bitcoin.org/reference/transactions.html#raw-transaction-format" target="_blank" rel="noreferrer">Raw transaction format</a>{native && <> · <a href="https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki" target="_blank" rel="noreferrer">SegWit (BIP141)</a> · <a href="https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki" target="_blank" rel="noreferrer">BIP143 signing</a></>}</div>
  </div>;
}
