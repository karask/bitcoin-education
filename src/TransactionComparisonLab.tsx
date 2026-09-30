import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, Layers, LoaderCircle, RotateCcw, Scale } from 'lucide-react';
import type { Network, TransactionComparisonResult } from './types';
import type { usePython } from './usePython';
import './comparison.css';
import { comparisonFee } from './comparisonMath';

type Scenario = { group: 'single' | 'multisig'; inputs: number; outputs: number };
const initial: Scenario = { group: 'single', inputs: 1, outputs: 2 };
const format = (value: number) => value.toLocaleString();

function CopyPython({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setFailed(false); }
    catch { setFailed(true); }
  }
  useEffect(() => { setCopied(false); setFailed(false); }, [value]);
  return <button className="text-button" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{failed ? 'Select the code to copy' : copied ? 'Copied Python' : 'Copy Python'}</button>;
}

export function TransactionComparisonLab({ runtime, visible }: { runtime: ReturnType<typeof usePython>; visible: boolean }) {
  const [scenario, setScenario] = useState<Scenario>(initial);
  const [network, setNetwork] = useState<Network>('mainnet');
  const [result, setResult] = useState<TransactionComparisonResult | null>(null);
  const [selected, setSelected] = useState('p2pkh');
  const [metric, setMetric] = useState<'vsize' | 'bytes'>('vsize');
  const [rate, setRate] = useState('5');
  const [signatureEdited, setSignatureEdited] = useState(false);
  const { calculate } = runtime;
  useEffect(() => {
    if (visible) {
      setResult(null);
      calculate({ kind: 'tx-compare', network, publicKey: '', compressed: true, transactionComparison: scenario });
    }
  }, [visible, scenario, network, calculate]);
  useEffect(() => {
    const data = runtime.trace?.transactionComparison;
    if (visible && data && data.group === scenario.group && data.inputs === scenario.inputs && data.outputs === scenario.outputs && runtime.trace?.network === network) setResult(data);
  }, [runtime.trace, visible, scenario, network]);
  const validRate = comparisonFee(1, rate) !== null;
  const fee = (vsize: number) => comparisonFee(vsize, rate) ?? 0;
  const active = result?.rows.find(row => row.type === selected) ?? result?.rows[0];
  const baseline = result?.rows[0];
  useEffect(() => { setSignatureEdited(false); }, [active?.type, result]);
  const maximum = result ? Math.max(...result.rows.map(row => metric === 'bytes' ? row.totalSize : row.weight / 4)) : 1;
  function change(next: Scenario) { setResult(null); setScenario(next); }
  function reset() { setNetwork('mainnet'); setRate('5'); setMetric('vsize'); setSelected('p2pkh'); change({ ...initial }); }
  return <div className="comparison-lab">
    <section className="hero comparison-hero"><div className="hero-copy"><div className="hero-meta"><span className="chapter-tag">TRANSACTIONS / COMPARISON LAB</span><span>SIGNED EXAMPLES</span></div><h1>Same payment.<br /><span>Different footprints.</span></h1><p>What does a payment weigh? Put real signed transactions on the scales, then follow the bytes that make the difference.</p></div><div className="comparison-scale" aria-hidden="true"><Scale size={56} strokeWidth={1.2} /><span>Every byte has a job.</span></div></section>
    <section className="panel comparison-controls" aria-label="Comparison scenario"><div className="comparison-section-heading"><div><span className="output-kicker">01 / SET UP A FAIR EXPERIMENT</span><h2>One scenario. Several ways to spend.</h2></div><button className="text-button" onClick={reset}><RotateCcw size={14} />Reset experiment</button></div>
      <div className="comparison-groups" role="group" aria-label="Spending condition"><button aria-pressed={scenario.group === 'single'} className={scenario.group === 'single' ? 'selected' : ''} onClick={() => { if (scenario.group !== 'single') { setSelected('p2pkh'); change({ ...scenario, group: 'single' }); } }}><strong>Single-key payments</strong><span>One signer, four input types</span></button><button aria-pressed={scenario.group === 'multisig'} className={scenario.group === 'multisig' ? 'selected' : ''} onClick={() => { if (scenario.group !== 'multisig') { setSelected('p2sh'); change({ ...scenario, group: 'multisig' }); } }}><strong>2-of-3 script spends</strong><span>Two co-signers, three input types</span></button></div>
      <div className="comparison-inputs"><label>Inputs<select aria-label="Comparison input count" value={scenario.inputs} onChange={event => change({ ...scenario, inputs: Number(event.target.value) })}>{[1, 2, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'input' : 'inputs'} · {format(n * 100000)} sats</option>)}</select></label><label>Outputs<select aria-label="Comparison output count" value={scenario.outputs} onChange={event => change({ ...scenario, outputs: Number(event.target.value) })}><option value={2}>Payment + change</option><option value={1}>One output · send the remainder</option></select></label><label>Network<select aria-label="Comparison network" value={network} onChange={event => { setResult(null); setNetwork(event.target.value as Network); }}><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select></label><label>Try a fee rate <span>sat/vB</span><input aria-label="Comparison fee rate" type="text" inputMode="decimal" value={rate} aria-invalid={!validRate} aria-describedby="comparison-rate-help" onChange={event => setRate(event.target.value)} /></label></div>
      <p id="comparison-rate-help" className={validRate ? 'comparison-note' : 'input-error'}>{validRate ? 'A hypothetical rate you choose. Fee quotes update instantly; they are not a live network estimate.' : 'Enter a fee rate from 0.01 to 1,000 sat/vB, with up to four decimal places.'}</p>
      <div className="comparison-fairness"><Layers size={18} /><p><strong>Same outputs. Same outpoints. Same amounts.</strong> Every row sends to the same P2WPKH recipient{scenario.outputs === 2 ? ' and returns change to the same P2WPKH script' : ''}. Only the input spending type changes. Keys use compressed form; ECDSA uses ALL and Taproot uses DEFAULT.</p></div>
      {scenario.group === 'multisig' && <p className="comparison-policy"><strong>Compare the selected spend, not the entire policy.</strong> All three rows use the same co-signer keys and a 2-of-3 check. The Taproot row spends the co-signer leaf of our two-leaf example; it also permits recovery after 144 blocks and immediate key-path spending with learning key 1. Its proof carries that extra branch.</p>}
    </section>
    {runtime.error && visible && <div className="input-error" role="alert">{runtime.error}<button className="text-button" onClick={() => change({ ...scenario })}>Try again</button></div>}
    {!result && <section className="panel comparison-loading" aria-live="polite"><LoaderCircle size={24} className={runtime.status.state !== 'error' ? 'spin' : undefined} /><h2>{runtime.status.state === 'error' ? 'Python needs a restart.' : 'Putting the examples on the scales…'}</h2><p>{runtime.status.state === 'ready' ? 'Building and signing each transaction in your browser.' : runtime.status.message}</p>{runtime.status.state === 'error' && <button className="secondary-button" onClick={runtime.retry}>Restart Python</button>}</section>}
    {result && active && baseline && <>
      <section className="panel comparison-chart" aria-label="Signed transaction comparison"><div className="comparison-section-heading"><div><span className="output-kicker">02 / WEIGH THE PAYMENT</span><h2>Pick a footprint to inspect.</h2></div><div className="segmented" role="group" aria-label="Size measurement"><button className={metric === 'vsize' ? 'selected' : ''} aria-pressed={metric === 'vsize'} onClick={() => setMetric('vsize')}>Virtual size</button><button className={metric === 'bytes' ? 'selected' : ''} aria-pressed={metric === 'bytes'} onClick={() => setMetric('bytes')}>Serialized bytes</button></div></div>
        <div className="comparison-legend"><span><i className="cmp-base" />Base structure</span><span><i className="cmp-unlock" />scriptSig data</span><span><i className="cmp-witness" />Witness + marker/flag</span></div>
        <div className="comparison-bars">{result.rows.map(row => {
          const divisor = metric === 'bytes' ? 1 : 4;
          const parts = [(row.baseSize - row.scriptSigBytes) * (metric === 'bytes' ? 1 : 4), row.scriptSigBytes * (metric === 'bytes' ? 1 : 4), row.witnessBytes];
          return <button className={`comparison-row ${active.type === row.type ? 'selected' : ''}`} key={row.type} aria-pressed={active.type === row.type} aria-label={`Inspect ${row.label}`} onClick={() => setSelected(row.type)}><div className="comparison-row-label"><strong>{row.label}</strong><span>{row.type === 'nested' ? 'P2SH-P2WPKH' : row.type === 'p2tr-script' ? 'P2TR · co-signer leaf' : row.type.toUpperCase()}</span></div><div className="comparison-bar-track" aria-hidden="true">{parts.map((part, i) => <span key={i} className={['cmp-base', 'cmp-unlock', 'cmp-witness'][i]} style={{ width: `${part / divisor / maximum * 100}%` }} />)}</div><div className="comparison-row-value"><strong>{metric === 'bytes' ? row.totalSize : row.vsize} <small>{metric === 'bytes' ? 'B' : 'vB'}</small></strong><span>{validRate ? `${format(fee(row.vsize))} sats` : '— sats'}</span></div></button>;
        })}</div>
        <p className="comparison-note">Base bytes count four weight units each; witness extension bytes count one. Virtual size = ceil(weight ÷ 4). The bars show the contributions before rounding. Fee = ceil(vsize × your rate), even when viewing serialized bytes.</p>
        <div className="comparison-summary"><span>{result.inputs} {result.inputs === 1 ? 'input' : 'inputs'} · {result.outputs} {result.outputs === 1 ? 'output' : 'outputs'}</span><span>{format(result.payment)} sats to recipient{result.outputs === 2 ? ` · ${format(result.change)} sats change` : ''}</span><span>Reference transactions leave {format(result.referenceFee)} sats as fee.</span></div>
        <p className="comparison-note">These are exact sizes for the signed reference examples. Fee quotes do not rewrite their outputs. Changing transaction contents can change ECDSA signature lengths, so other payments can differ by a few bytes.</p>
      </section>
      <section className="panel comparison-inspector" aria-label="Selected transaction details"><div className="comparison-section-heading"><div><span className="output-kicker">03 / FOLLOW THE DIFFERENCE</span><h2>{active.label}</h2></div><Scale size={24} /></div>
        <div className="comparison-stats"><div><span>SERIALIZED</span><strong>{active.totalSize}<small>bytes</small></strong></div><div><span>WEIGHT</span><strong>{active.weight}<small>WU</small></strong></div><div><span>VIRTUAL SIZE</span><strong>{active.vsize}<small>vB</small></strong></div><div><span>AT YOUR RATE</span><strong>{validRate ? format(fee(active.vsize)) : '—'}<small>sats</small></strong></div></div>
        {active.type !== baseline.type && <p className="comparison-saving">{active.vsize < baseline.vsize ? `${baseline.vsize - active.vsize} fewer vbytes` : `${active.vsize - baseline.vsize} more vbytes`} than {baseline.label}{validRate ? ` · ${format(Math.abs(fee(baseline.vsize) - fee(active.vsize)))} sats ${fee(active.vsize) <= fee(baseline.vsize) ? 'less' : 'more'} at ${rate} sat/vB` : ''}.</p>}
        <div className="comparison-reveal"><span className="output-kicker">WHAT THIS SPEND REVEALS</span><p>{active.reveals}</p></div>
        <div className="comparison-data-grid"><div><h3>scriptSig</h3><span>{active.scriptSigBytes} data bytes across all inputs</span><p>{active.input.scriptSig ? 'Input 1 unlocking script:' : 'Empty. Authorization lives in witness.'}</p>{active.input.scriptSig && <code>{active.input.scriptSig}</code>}</div><div><h3>Witness</h3><span>{active.witnessBytes} extension bytes across all inputs{active.hasWitness ? ' · includes marker + flag' : ''}</span><p>{active.hasWitness ? `Input 1 has ${active.input.witness.length} stack ${active.input.witness.length === 1 ? 'item' : 'items'}:` : 'No witness section. TXID and WTXID are equal.'}</p>{active.input.witness.map((item, i) => <div className="comparison-witness-item" key={i}><span>Item {i + 1} · {item.length / 2} B</span><code>{item || '(empty item)'}</code></div>)}</div></div>
        <details className="comparison-details"><summary>Inspect the shared outputs and previous lock</summary><p>Previous locking script for input 1:</p><code>{active.inputLock}</code>{result.outputScripts.map((script, i) => <div key={i}><p>Output {i + 1} · identical in every row:</p><code>{script}</code></div>)}</details>
      </section>
      <section className="panel comparison-ids" aria-label="Transaction ID experiment"><span className="output-kicker">04 / CHANGE ONE SIGNATURE BYTE</span><h2>Which ID notices?</h2><p>Flip byte {active.mutation.byteOffset} of <strong>{active.mutation.field}</strong> from <code>{active.mutation.before}</code> to <code>{active.mutation.after}</code>. This deliberately invalid signature is only a hashing experiment.</p><button className="secondary-button comparison-flip" aria-pressed={signatureEdited} onClick={() => setSignatureEdited(!signatureEdited)}>{signatureEdited ? <RotateCcw size={14} /> : <ArrowRight size={14} />}{signatureEdited ? 'Restore original byte' : 'Flip the signature byte'}</button><div className="comparison-id-grid">{(['txid', 'wtxid'] as const).map(id => <div key={id}><h3>{id.toUpperCase()} <span className={active[id] === active.mutation[id] ? 'id-same' : 'id-changed'}>{!signatureEdited ? 'original' : active[id] === active.mutation[id] ? 'stays the same' : 'changes'}</span></h3><span>Original</span><code>{active[id]}</code><span>{signatureEdited ? 'After the edit' : 'Flip the byte to compare'}</span><code>{signatureEdited ? active.mutation[id] : '—'}</code></div>)}</div><p className="comparison-note">TXID hashes base serialization, including scriptSig. WTXID hashes the full serialization, including witness. Changing an output or sequence changes the base serialization and affects both IDs. Nested SegWit keeps its redeem program in scriptSig, but its signatures are in witness.</p></section>
      <details className="panel comparison-details comparison-source"><summary>Open the exact signed bytes and Python</summary><h3>{active.label} · {active.totalSize} bytes</h3><code className="comparison-full-hex">{active.hex}</code><div className="comparison-source-heading"><h3>Reproduce this reference transaction</h3><CopyPython value={active.python} /></div><p>Use the project’s Python helpers for Taproot. This code recreates the fixed 1,000-sat reference fee; the interactive fee quote is calculated separately.</p><pre>{active.python}</pre></details>
    </>}
    <div className="comparison-next"><p>Ready to follow one transaction all the way through?</p><a className="primary-button" href="#transaction">Explore transaction anatomy<ArrowRight size={15} /></a></div>
    <div className="lesson-sources">Read the specifications: <a href="https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki" target="_blank" rel="noreferrer">BIP 141</a><a href="https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki" target="_blank" rel="noreferrer">BIP 341</a></div>
  </div>;
}
