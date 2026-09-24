import { useEffect, useState } from 'react';
import { ArrowRight, Check, GitMerge, Layers3 } from 'lucide-react';
import type { CandidateResult, Network, TransactionPage } from './types';
import type { usePython } from './usePython';
import { MiningLesson } from './MiningLesson';
import { BlockJourney } from './BlockJourney';
import './construction.css';

type Config = { height: number; budget: number; include: boolean };
const DEFAULT: Config = { height: 840000, budget: 1000, include: true };
const shortHash = (hex: string) => `${hex.slice(0, 12)}…${hex.slice(-10)}`;

export function BlockConstructionLesson({ runtime, page, hex, txid, fee, vsize, network }: {
  runtime: ReturnType<typeof usePython>; page: TransactionPage; hex: string; txid: string;
  fee: number; vsize: number; network: Network;
}) {
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [candidate, setCandidate] = useState<CandidateResult | null>(null);
  const [pending, setPending] = useState(false);
  const [pairIndex, setPairIndex] = useState(0);
  const [extraBlocks, setExtraBlocks] = useState(0);
  const active = page === 'construction' || page === 'mining' || page === 'blocks';
  useEffect(() => {
    if (pending && runtime.trace?.candidate) {
      setCandidate(runtime.trace.candidate);
      setPending(false);
      setPairIndex(0);
    }
  }, [pending, runtime.trace]);
  useEffect(() => { if (runtime.error) setPending(false); }, [runtime.error]);
  useEffect(() => {
    if (active && !candidate && !pending && !runtime.busy && !runtime.error && runtime.status.state === 'ready') {
      setPending(true);
      runtime.calculate({ kind: 'construction', publicKey: '', compressed: true, network,
        candidate: { hex, fee, network, ...config } });
    }
  }, [active, candidate, pending, runtime, network, hex, fee, config]);
  function update(next: Config) {
    setConfig(next); setCandidate(null); setExtraBlocks(0); setPairIndex(0);
    setPending(true);
    runtime.calculate({ kind: 'construction', publicKey: '', compressed: true, network,
      candidate: { hex, fee, network, ...next } });
  }
  const selected = candidate?.selected.includes('yours') ?? false;
  const pair = candidate?.merkle.pairs[pairIndex];

  return <div className="construction-lesson">
    {page === 'construction' && <>
      <div className="journey-identity"><span>FOLLOWING YOUR SIGNED TXID</span><code>{txid}</code><div><span>{vsize} vB</span><span>{fee.toLocaleString()} sats fee</span><strong>Available for selection in this example</strong></div></div>
      <section className="panel mining-card construction-card">
        <span className="output-kicker">01 / CHOOSE TRANSACTIONS</span><h2>Build from a local view.</h2>
        <p>Start with your signed transaction and two illustrative independent legacy transactions built by the library. This is a fresh assumed pool view, separate from the Propagation simulation. Fees for the two examples are assumed; their UTXOs and signatures are not checked. Selection uses fee rate and a teaching budget, not Bitcoin Core's package-selection policy or the consensus block-weight limit.</p>
        <div className="mining-controls"><label>Block height<select aria-label="Candidate block height" value={config.height} onChange={(event) => update({ ...config, height: Number(event.target.value) })}><option value={839999}>839,999 · before halving</option><option value={840000}>840,000 · fourth halving</option><option value={840001}>840,001 · after halving</option><option value={1050000}>1,050,000 · next halving</option></select></label><label>Transaction-space budget<select aria-label="Candidate transaction budget" value={config.budget} onChange={(event) => update({ ...config, budget: Number(event.target.value) })}>{[300, 600, 1000].map((size) => <option key={size} value={size}>{size.toLocaleString()} vB</option>)}</select></label><label><input type="checkbox" checked={config.include} onChange={(event) => update({ ...config, include: event.target.checked })} />Offer your transaction</label></div>
        {candidate && <><div className="construction-entries">{candidate.entries.map((entry) => <div key={entry.id} className={entry.selected ? 'selected' : ''}><span className="construction-choice">{entry.selected ? <Check size={15} /> : '—'}</span><div><strong>{entry.label}</strong><code title={entry.txid}>{shortHash(entry.txid)}</code></div><span>{entry.vsize} vB</span><strong>{entry.rate.toFixed(2)} sat/vB</strong><small>{entry.selected ? 'Selected' : 'Skipped'}</small></div>)}</div><p className="construction-footnote">{candidate.used.toLocaleString()} / {candidate.budget.toLocaleString()} vB of ordinary transactions selected. The coinbase and header are outside this teaching budget. {selected ? 'Your transaction is included.' : 'Your transaction is not included.'}</p></>}
      </section>
      {candidate && <><section className="panel mining-card construction-card"><span className="output-kicker">02 / CREATE THE COINBASE</span><h2>Pay the block producer.</h2><p>The coinbase is first. Its null outpoint creates the subsidy; its scriptSig starts with the BIP34 block height. The example claims the entire subsidy plus the assumed fees from selected transactions.</p><div className="construction-equation"><div><span>SUBSIDY AT HEIGHT {candidate.height.toLocaleString()}</span><strong>{candidate.subsidy.toLocaleString()} <small>sats</small></strong></div><b>+</b><div><span>SELECTED TRANSACTION FEES</span><strong>{candidate.fees.toLocaleString()} <small>sats</small></strong></div><b>=</b><div className="total"><span>COINBASE OUTPUT</span><strong>{candidate.reward.toLocaleString()} <small>sats</small></strong></div></div><div className="construction-detail-grid"><div><span>Coinbase scriptSig · height first</span><code>{candidate.coinbase.scriptSig}</code></div><div><span>Coinbase TXID</span><code>{candidate.coinbase.txid}</code></div><div><span>Example miner payout script</span><code>{candidate.coinbase.payoutScript}</code></div></div><details className="mining-details"><summary>Inspect serialized coinbase transaction</summary><code>{candidate.coinbase.hex}</code></details></section>
      <section className="panel mining-card construction-card"><div className="construction-heading"><div><span className="output-kicker">03 / COMMIT TO EVERY SELECTED TXID</span><h2>Build the Merkle root.</h2></div><GitMerge size={27} /></div><p>Order matters: coinbase first, then the selected transactions. The library reverses displayed TXIDs to internal bytes, hashes each pair with double SHA-256, and duplicates an unpaired final hash at each level.</p><div className="merkle-levels" aria-label="Merkle tree levels">{candidate.merkle.levels.map((level, index) => <div key={index}><span>{index === 0 ? `TXIDS · ${level.length} LEAVES` : index === candidate.merkle.levels.length - 1 ? 'ROOT' : `LEVEL ${index} · ${level.length} HASHES`}</span><div>{level.map((hash, hashIndex) => <code key={hashIndex} title={hash}>{shortHash(hash)}</code>)}</div></div>)}</div>{candidate.merkle.pairs.length > 0 && <><div className="construction-pair-picker" aria-label="Merkle hash pairs">{candidate.merkle.pairs.map((item, index) => <button key={`${item.level}-${item.index}`} className={pairIndex === index ? 'selected' : ''} aria-pressed={pairIndex === index} onClick={() => setPairIndex(index)}>L{item.level} · pair {item.index + 1}{item.duplicated ? ' · duplicate' : ''}</button>)}</div>{pair && <div className="construction-pair-detail"><span>DOUBLE SHA-256 · LEVEL {pair.level}</span><div><small>LEFT TXID / HASH</small><code>{pair.left}</code></div><b>+</b><div><small>RIGHT {pair.duplicated ? '· DUPLICATED ODD NODE' : 'TXID / HASH'}</small><code>{pair.right}</code></div><div><small>64-BYTE PREIMAGE · INTERNAL BYTE ORDER</small><code>{pair.preimage}</code></div><div className="parent"><small>PARENT HASH · DISPLAY ORDER</small><code>{pair.parent}</code></div></div>}</>}<div className="construction-root"><Layers3 size={18} /><div><span>MERKLE ROOT · DISPLAY ORDER</span><code>{candidate.merkle.root}</code><small>Header bytes: {candidate.merkle.root_internal}</small></div></div>{candidate.merkle.mutated && <p className="input-error" role="alert">Duplicate existing sibling hashes make this candidate ambiguous. Change the transaction set before mining.</p>}<details className="mining-details"><summary>Python used to build this candidate</summary><pre>{candidate.python}</pre></details><a className="primary-button construction-next" href="#mining">Hash this candidate<ArrowRight size={15} /></a></section></>}
    </>}
    {active && (pending || runtime.status.state === 'loading') && <section className="panel tx-stage-empty" role="status"><h2>Building in Python…</h2><p>{runtime.status.state === 'ready' ? 'Calculating transaction IDs, coinbase, and Merkle pairs.' : runtime.status.message}</p></section>}
    {active && runtime.error && <p className="input-error" role="alert">{runtime.error}</p>}
    {page === 'mining' && candidate && !candidate.merkle.mutated && <MiningLesson key={candidate.merkle.root} runtime={runtime} txid={txid} fee={fee} vsize={vsize} candidate={candidate} />}
    {page === 'blocks' && candidate && <BlockJourney key={candidate.merkle.root} selected={selected} extraBlocks={extraBlocks} setExtraBlocks={setExtraBlocks} reset={() => setExtraBlocks(0)} />}
    {page === 'construction' && <div className="lesson-sources">References: <a href="https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki" target="_blank" rel="noreferrer">BIP 34 · block height in coinbase</a> · <a href="https://github.com/bitcoin/bitcoin/blob/master/src/consensus/merkle.cpp" target="_blank" rel="noreferrer">Bitcoin Core · Merkle calculation</a></div>}
  </div>;
}
