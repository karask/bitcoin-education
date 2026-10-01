import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, GitMerge } from 'lucide-react';
import type { CandidateResult, LessonInput, Network, TransactionPage } from './types';
import type { usePython } from './usePython';
import { MiningLesson } from './MiningLesson';
import { BlockJourney } from './BlockJourney';
import { MerkleTreeExplorer } from './MerkleTreeExplorer';
import { WitnessCommitmentExplorer } from './WitnessCommitmentExplorer';
import './construction.css';

import type { TransactionSource } from './transactionSession';

type Config = { height: number; budget: number; include: boolean };
const DEFAULT: Config = { height: 840000, budget: 1000, include: true };
const shortHash = (hex: string) => `${hex.slice(0, 12)}…${hex.slice(-10)}`;

export function BlockConstructionLesson({ runtime, page, hex, txid, fee, vsize, network, hasWitness, enabled = true, source }: {
  source: TransactionSource; enabled?: boolean; runtime: ReturnType<typeof usePython>; page: TransactionPage; hex: string; txid: string;
  fee: number; vsize: number; network: Network; hasWitness: boolean;
}) {
  const subject = source === 'example' ? 'Example transaction' : 'Your transaction';
  const pendingInput = useRef<LessonInput | null>(null);
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [candidate, setCandidate] = useState<CandidateResult | null>(null);
  const [pending, setPending] = useState(false);
  const [extraBlocks, setExtraBlocks] = useState(0);
  const active = enabled && (page === 'construction' || page === 'mining' || page === 'blocks');
  useEffect(() => { if (!active) setPending(false); }, [active]);
  useEffect(() => {
    if (active && pending && runtime.traceInput === pendingInput.current && runtime.trace?.candidate) {
      setCandidate(runtime.trace.candidate);
      setPending(false);
    }
  }, [active, pending, runtime.trace, runtime.traceInput]);
  useEffect(() => { if (runtime.error) setPending(false); }, [runtime.error]);
  useEffect(() => {
    if (active && !candidate && !pending && !runtime.busy && !runtime.error && runtime.status.state === 'ready') {
      setPending(true);
      request({ kind: 'construction', publicKey: '', compressed: true, network,
        candidate: { hex, fee, network, ...config } });
    }
  }, [active, candidate, pending, runtime, network, hex, fee, config]);
  function request(input: LessonInput) { pendingInput.current = input; runtime.calculate(input); }
  function update(next: Config) {
    setConfig(next); setCandidate(null); setExtraBlocks(0);
    setPending(true);
    request({ kind: 'construction', publicKey: '', compressed: true, network,
      candidate: { hex, fee, network, ...next } });
  }
  const selected = candidate?.selected.includes('yours') ?? false;

  return <div className="construction-lesson">
    {page === 'construction' && <>
      <div className="journey-identity"><span>{source === 'example' ? 'FOLLOWING THE EXAMPLE SIGNED TXID' : 'FOLLOWING YOUR SIGNED TXID'}</span><code>{txid}</code><div><span>{vsize} vB</span><span>{fee.toLocaleString()} sats fee</span><strong>Available for selection in this example</strong></div></div>
      <section className="panel mining-card construction-card">
        <span className="output-kicker">01 / CHOOSE TRANSACTIONS</span><h2>Build from a local view.</h2>
        <p>Start with the selected signed transaction and two illustrative independent legacy transactions built by the library. This is a fresh assumed pool view, separate from the Propagation simulation. Fees for the two examples are assumed; their UTXOs and signatures are not checked. Selected witness transactions add a coinbase witness commitment. Selection uses virtual-byte fee rate and a teaching budget, not Bitcoin Core's package-selection policy or the consensus block-weight limit.</p>
        <div className="mining-controls"><label>Block height<select aria-label="Candidate block height" value={config.height} onChange={(event) => update({ ...config, height: Number(event.target.value) })}><option value={839999}>839,999 · before halving</option><option value={840000}>840,000 · fourth halving</option><option value={840001}>840,001 · after halving</option><option value={1050000}>1,050,000 · next halving</option></select></label><label>Transaction-space budget<select aria-label="Candidate transaction budget" value={config.budget} onChange={(event) => update({ ...config, budget: Number(event.target.value) })}>{[300, 600, 1000].map((size) => <option key={size} value={size}>{size.toLocaleString()} vB</option>)}</select></label><label><input type="checkbox" aria-label={`Offer ${subject.toLowerCase()}`} checked={config.include} onChange={(event) => update({ ...config, include: event.target.checked })} />Offer {subject.toLowerCase()}</label></div>
        {candidate && <><div className="construction-entries">{candidate.entries.map((entry) => <div key={entry.id} className={entry.selected ? 'selected' : ''}><span className="construction-choice">{entry.selected ? <Check size={15} /> : '—'}</span><div><strong>{entry.id === 'yours' ? subject : entry.label}</strong><code title={entry.txid}>{shortHash(entry.txid)}</code></div><span>{entry.vsize} vB</span><strong>{entry.rate.toFixed(2)} sat/vB</strong><small>{entry.selected ? 'Selected' : 'Skipped'}</small></div>)}</div><p className="construction-footnote">{candidate.used.toLocaleString()} / {candidate.budget.toLocaleString()} vB of ordinary transactions selected. The coinbase and header are outside this teaching budget. {subject} {selected ? 'is included.' : 'is not included.'}</p></>}
      </section>
      {candidate && hasWitness && !candidate.witnessCommitment && <p className="tx-context" role="status">The selected witness transaction was omitted or did not fit the budget. All selected entries are legacy, so this candidate uses a legacy coinbase and the ordinary TXID tree. A witness commitment is optional when no selected transaction has witness data.</p>}
      {candidate && <><section className="panel mining-card construction-card"><span className="output-kicker">02 / CREATE THE COINBASE</span><h2>Pay the block producer.</h2><p>The coinbase is first. Its null outpoint creates the subsidy; its scriptSig starts with the BIP34 block height. The example claims the entire subsidy plus the assumed fees from selected transactions.</p><div className="construction-equation"><div><span>SUBSIDY AT HEIGHT {candidate.height.toLocaleString()}</span><strong>{candidate.subsidy.toLocaleString()} <small>sats</small></strong></div><b>+</b><div><span>SELECTED TRANSACTION FEES</span><strong>{candidate.fees.toLocaleString()} <small>sats</small></strong></div><b>=</b><div className="total"><span>MINER PAYOUT</span><strong>{candidate.reward.toLocaleString()} <small>sats</small></strong></div></div><div className="construction-detail-grid"><div><span>Coinbase scriptSig · height first</span><code>{candidate.coinbase.scriptSig}</code></div><div><span>Coinbase TXID</span><code>{candidate.coinbase.txid}</code></div><div><span>Example miner payout script</span><code>{candidate.coinbase.payoutScript}</code></div></div><details className="mining-details"><summary>Inspect serialized coinbase transaction</summary><code>{candidate.coinbase.hex}</code></details></section>
      <WitnessCommitmentExplorer candidate={candidate} /><section className="panel mining-card construction-card"><div className="construction-heading"><div><span className="output-kicker">{candidate.witnessCommitment ? '04' : '03'} / COMMIT TO EVERY SELECTED TXID</span><h2>Build the Merkle root.</h2></div><GitMerge size={27} /></div><p>Order matters: the completed coinbase first, then the selected transactions. This tree uses TXIDs, even for transactions with witness data. The local Python helper reverses displayed TXIDs to internal bytes, hashes each pair with double SHA-256, and duplicates an unpaired final hash at each level.</p><MerkleTreeExplorer key={candidate.merkle.root} tree={candidate.merkle} leafLabels={['Coinbase · final TXID', ...candidate.selected.map(id => id === 'yours' ? subject : candidate.entries.find(entry => entry.id === id)!.label)]} />{candidate.merkle.mutated && <p className="input-error" role="alert">Duplicate existing sibling hashes make this candidate ambiguous. Change the transaction set before mining.</p>}<details className="mining-details"><summary>Python used to build this candidate</summary><p>The bitcoin_education helpers ship with this project. To run this example locally, add public/python to your Python module path.</p><pre>{candidate.python}</pre></details><a className="primary-button construction-next" href="#mining">Hash this candidate<ArrowRight size={15} /></a></section></>}
    </>}
    {active && (pending || runtime.status.state === 'loading') && <section className="panel tx-stage-empty" role="status"><h2>Building in Python…</h2><p>{runtime.status.state === 'ready' ? 'Calculating transaction IDs, coinbase, and Merkle pairs.' : runtime.status.message}</p></section>}
    {active && runtime.error && <p className="input-error" role="alert">{runtime.error}</p>}
    {candidate && !candidate.merkle.mutated && <div hidden={page !== 'mining'}><MiningLesson enabled={active && page === 'mining'} source={source} key={candidate.merkle.root} runtime={runtime} txid={txid} fee={fee} vsize={vsize} candidate={candidate} /></div>}
    {candidate && <div hidden={page !== 'blocks'}><BlockJourney enabled={active && page === 'blocks'} source={source} key={candidate.merkle.root} candidate={candidate} selected={selected} extraBlocks={extraBlocks} setExtraBlocks={setExtraBlocks} reset={() => setExtraBlocks(0)} /></div>}
    {page === 'construction' && <div className="lesson-sources">References: <a href="https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki" target="_blank" rel="noreferrer">BIP 34 · block height in coinbase</a> · <a href="https://github.com/bitcoin/bitcoin/blob/master/src/consensus/merkle.cpp" target="_blank" rel="noreferrer">Bitcoin Core · Merkle calculation</a> · <a href="https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki" target="_blank" rel="noreferrer">BIP 141 · witness commitment</a></div>}
  </div>;
}
