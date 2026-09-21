import { useEffect, useState } from 'react';
import type { MiningResult } from './types';
import type { usePython } from './usePython';
import './mining.css';

export function MiningLesson({ runtime, txid, fee, vsize }: { runtime: ReturnType<typeof usePython>; txid: string; fee: number; vsize: number }) {
  const [include, setInclude] = useState(true);
  const [budget, setBudget] = useState(1000);
  const [difficulty, setDifficulty] = useState<'easy' | 'harder'>('easy');
  const [result, setResult] = useState<MiningResult | null>(null);
  const [history, setHistory] = useState<MiningResult['attempts']>([]);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [extraBlocks, setExtraBlocks] = useState(0);
  const [requestPending, setRequestPending] = useState(false);
  useEffect(() => {
    if (requestPending && runtime.trace?.mining) {
      setResult(runtime.trace.mining);
      setHistory((previous) => [...previous, ...runtime.trace!.mining!.attempts]);
      setRequestPending(false);
    }
  }, [runtime.trace, requestPending]);
  useEffect(() => { if (runtime.error) setRequestPending(false); }, [runtime.error]);
  const pool = [
    { id: 'yours', title: 'Your signed transaction', size: vsize, fee, rate: fee / vsize },
    { id: 'alpha', title: 'Fictional entry α', size: 180, fee: 360, rate: 2 },
    { id: 'gamma', title: 'Fictional entry γ', size: 240, fee: 2880, rate: 12 },
  ].filter((entry) => entry.id !== 'yours' || include).sort((a, b) => b.rate - a.rate);
  // This is a small selection exercise for independent entries, not full block assembly.
  let used = 0;
  const candidate = pool.filter((entry) => { if (used + entry.size > budget) return false; used += entry.size; return true; });
  const selected = candidate.some((entry) => entry.id === 'yours');
  const confirmations = selected && accepted.includes('A') ? 1 + extraBlocks : 0;
  function resetChain() { setAccepted([]); setExtraBlocks(0); }
  function attempt(count: number) {
    setRequestPending(true);
    runtime.calculate({ kind: 'mining', publicKey: '', compressed: true, network: 'mainnet', mining: { startNonce: result?.nextNonce ?? 0, difficulty, count } });
  }
  function resetHash(next = difficulty) {
    runtime.invalidate(); setRequestPending(false); setDifficulty(next); setResult(null); setHistory([]);
  }
  const latest = history.at(-1);
  const fields = [
    ['Version', 0, 4, '2, serialized little-endian'], ['Previous block hash', 4, 36, 'Supplied zero-valued sample'],
    ['Merkle root', 36, 68, 'Supplied 11…11 fixture; not derived from your transaction'],
    ['Timestamp', 68, 72, 'Fixed Unix timestamp 1700000000'], ['nBits', 72, 76, 'Compact encoding of the demonstration target'], ['Nonce', 76, 80, 'Four-byte little-endian counter'],
  ] as const;
  return <div className="mining-lesson">
    <div className="journey-identity"><span>FOLLOWING YOUR SIGNED TXID</span><code>{txid}</code><div><span>{vsize} vB</span><span>{(fee / vsize).toFixed(2)} sat/vB</span><strong data-testid="confirmation-count">{confirmations} {confirmations === 1 ? 'confirmation' : 'confirmations'} · simulated at node A</strong></div></div>
    <section className="panel mining-card"><span className="output-kicker">01 / SELECT A CANDIDATE</span><h2>Choose from a local mempool.</h2><p>This exercise starts with your transaction available at the pool node, plus two fictional independent entries. It is a fresh assumed snapshot; it does not depend on running the propagation lesson.</p><div className="mining-controls"><label>Transaction-space budget<select aria-label="Candidate transaction budget" value={budget} disabled={accepted.length > 0} onChange={(event) => { setBudget(Number(event.target.value)); resetChain(); }}>{[300, 600, 1000, 10000].map((size) => <option key={size} value={size}>{size.toLocaleString()} vB</option>)}</select></label><label><input type="checkbox" checked={include} disabled={accepted.length > 0} onChange={(event) => { setInclude(event.target.checked); resetChain(); }} />Offer your transaction for selection</label></div><div className="mining-candidate"><div className="mining-coinbase"><strong>First: coinbase</strong><small>A real block starts with a transaction claiming up to the subsidy plus included fees. Shown conceptually; no coinbase is built here.</small></div>{candidate.map((entry) => <div key={entry.id} className={entry.id === 'yours' ? 'selected' : ''}><strong>{entry.title}</strong><span>{entry.size} vB · {entry.rate.toFixed(2)} sat/vB</span></div>)}</div><p>{used.toLocaleString()} / {budget.toLocaleString()} vB used by selected ordinary entries. Your transaction is {selected ? 'selected' : 'not selected'}. This teaching budget excludes the header and coinbase; a real block is limited by weight. Entries are tried by fee rate, skipping those that do not fit. Dependencies and packages are outside this exercise.</p></section>
    <section className="panel mining-card"><span className="output-kicker">02 / REAL HEADER HASHING</span><h2>Try a nonce. Compare the hash.</h2><p>python-bitcoin-utils serializes and double-hashes this 80-byte sample header. Its supplied Merkle root is <strong>not a commitment to the candidate above</strong>. Building that root awaits a library API. This is a standalone proof-of-work exercise, not a valid mined block.</p><div className="mining-controls"><label>Demonstration target<select aria-label="Demonstration target" value={difficulty} onChange={(event) => resetHash(event.target.value as 'easy' | 'harder')}><option value="easy">Easy · about 1 in 16 per try</option><option value="harder">Smaller target · about 1 in 512 per try</option></select></label><button className="primary-button" disabled={runtime.busy || runtime.status.state !== 'ready' || !!result?.found} onClick={() => attempt(1)}>Try next nonce</button><button className="secondary-button" disabled={runtime.busy || runtime.status.state !== 'ready' || !!result?.found} onClick={() => attempt(64)}>Try up to 64 nonces</button><button className="text-button" onClick={() => resetHash()}>Reset hashing</button></div><p>The network determines the required target on a real chain. These easy targets are only for demonstration. A smaller target lowers the chance per attempt; earlier failures do not make the next attempt more likely to succeed.</p>
      {result && latest && <><div className={`mining-hash-result ${result.found ? 'found' : ''}`} role="status"><strong>{result.found ? 'Sample hash meets the target' : 'Keep searching'}</strong><span>{history.length} attempts · last nonce {latest.nonce}</span><h4>Hash (display order)</h4><code>{latest.hash}</code><h4>Target · hash must be ≤ this value</h4><code>{result.target}</code><small>nBits: {result.bits}</small></div><details className="mining-details"><summary>Inspect the 80-byte header</summary>{fields.map(([name, start, end, meaning]) => <div key={name}><strong>{name} · bytes {start}–{end - 1}</strong><code>{result.header.slice(start * 2, end * 2)}</code><p>{meaning}</p></div>)}</details><details className="mining-details"><summary>Nonce attempts ({history.length})</summary><div className="mining-attempts">{history.map((row) => <div key={row.nonce}><span>{row.nonce}</span><code>{row.hash}</code><strong>{row.success ? 'Meets target' : 'Above target'}</strong></div>)}</div></details><details className="mining-details"><summary>Python for the last batch</summary><pre>{result.python}</pre></details></>}
    </section>
    <section className="panel mining-card"><span className="output-kicker">03 / SIMULATED BLOCK ACCEPTANCE</span><h2>A block arrives. Nodes decide.</h2><p>This separate simulation assumes a correctly assembled block containing the candidate above, valid proof of work at the required target, and successful consensus validation. It does not use the sample header as evidence of inclusion. Each node accepts it independently; even a transaction absent from its mempool can arrive in a block.</p><div className="mining-node-list">{['A', 'B', 'C', 'D', 'E'].map((node) => <button key={node} className={accepted.includes(node) ? 'accepted' : ''} disabled={accepted.includes(node)} onClick={() => setAccepted((previous) => [...previous, node])}><strong>Node {node}</strong><span>{accepted.includes(node) ? 'Block accepted · modeled' : 'Simulate acceptance'}</span><small>{accepted.includes(node) && selected ? 'Your transaction confirmed here' : accepted.includes(node) ? 'Your transaction still pending' : 'Block not yet accepted'}</small></button>)}</div><p>{accepted.length} / 5 nodes have accepted the simulated block. Acceptance removes included transactions from their local mempools and spends the referenced UTXOs. Neither mempool membership nor merely finding a low header hash is a confirmation.</p><div className="mining-chain" aria-label="Simulated chain at node A"><div>Previous tip</div><span>→</span>{accepted.includes('A') ? <><div className={selected ? 'included' : ''}>Candidate block<small>{selected ? 'Contains your transaction' : 'Excludes your transaction'}</small></div>{extraBlocks > 0 && <><span>→</span><div>+{extraBlocks} blocks<small>Built on this block</small></div></>}</> : <div>Waiting for node A</div>}</div><div className="mining-controls"><button className="primary-button" disabled={!accepted.includes('A') || extraBlocks >= 5} onClick={() => setExtraBlocks((count) => count + 1)}>Simulate next block at A</button><button className="text-button" onClick={resetChain}>Reset block simulation</button></div><p>Node A reports <strong>{confirmations} confirmations</strong> for your transaction. Inclusion gives the first; each later block on that chain adds one. These steps are not ten-minute timers or real security estimates. A reorganization can reduce confirmation depth; one is not modeled here.</p></section>
    <div className="lesson-sources">Reference: <a href="https://developer.bitcoin.org/devguide/block_chain.html" target="_blank" rel="noreferrer">Blocks and proof of work</a></div>
  </div>;
}
