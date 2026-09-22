import { useEffect, useState } from 'react';
import type { MiningResult } from './types';
import type { usePython } from './usePython';
import { BlockJourney } from './BlockJourney';
import './mining.css';

export function MiningLesson({ runtime, txid, fee, vsize, page }: { runtime: ReturnType<typeof usePython>; txid: string; fee: number; vsize: number; page: 'mining' | 'blocks' }) {
  const [include, setInclude] = useState(true);
  const [budget, setBudget] = useState(1000);
  const [difficulty, setDifficulty] = useState<'easy' | 'harder'>('easy');
  const [result, setResult] = useState<MiningResult | null>(null);
  const [history, setHistory] = useState<MiningResult['attempts']>([]);
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
  function resetChain() { setExtraBlocks(0); }
  function attempt(count: number) {
    setRequestPending(true);
    runtime.calculate({ kind: 'mining', publicKey: '', compressed: true, network: 'mainnet', mining: { startNonce: result?.nextNonce ?? 0, difficulty, count } });
  }
  function resetHash(next = difficulty) {
    runtime.invalidate(); setRequestPending(false); setDifficulty(next); setResult(null); setHistory([]);
  }
  const latest = history.at(-1);
  const shownNonce = latest?.nonce ?? 0;
  const target = result?.target ?? (difficulty === 'easy' ? '0fffff' + '0'.repeat(58) : '007fffff' + '0'.repeat(56));
  const bits = result?.bits ?? (difficulty === 'easy' ? '200fffff' : '1f7fffff');
  const nonceHex = shownNonce.toString(16).padStart(8, '0').match(/../g)!.reverse().join('');
  const header = result?.header ?? `02000000${'00'.repeat(32)}${'11'.repeat(32)}00f15365${bits.match(/../g)!.reverse().join('')}${nonceHex}`;
  const fields = [
    ['Version', 0, 4, '2', 'Serialized little-endian'], ['Previous block hash', 4, 36, '00…00', 'Supplied zero-valued sample'],
    ['Merkle root', 36, 68, '11…11', 'Supplied fixture; not derived from your transaction'],
    ['Timestamp', 68, 72, '1700000000', 'Fixed Unix timestamp'], ['nBits', 72, 76, bits, 'Compact target encoding'], ['Nonce', 76, 80, shownNonce.toLocaleString(), 'Four-byte counter; changes each attempt'],
  ] as const;
  return <div className="mining-lesson">
    <div className="journey-identity"><span>FOLLOWING YOUR SIGNED TXID</span><code>{txid}</code><div><span>{vsize} vB</span><span>{(fee / vsize).toFixed(2)} sat/vB</span><strong>{page === 'mining' ? 'Candidate transaction' : 'Following the candidate block'}</strong></div></div>
    {page === 'mining' && <>
    <section className="panel mining-card"><span className="output-kicker">01 / SELECT A CANDIDATE</span><h2>Choose from a local mempool.</h2><p>This exercise starts with your transaction available at the pool node, plus two fictional independent entries. It is a fresh assumed snapshot; it does not depend on running the propagation lesson.</p><div className="mining-controls"><label>Transaction-space budget<select aria-label="Candidate transaction budget" value={budget} onChange={(event) => { setBudget(Number(event.target.value)); resetChain(); }}>{[300, 600, 1000, 10000].map((size) => <option key={size} value={size}>{size.toLocaleString()} vB</option>)}</select></label><label><input type="checkbox" checked={include} onChange={(event) => { setInclude(event.target.checked); resetChain(); }} />Offer your transaction for selection</label></div><div className="mining-candidate"><div className="mining-coinbase"><strong>First: coinbase</strong><small>A real block starts with a transaction claiming up to the subsidy plus included fees. Shown conceptually; no coinbase is built here.</small></div>{candidate.map((entry) => <div key={entry.id} className={entry.id === 'yours' ? 'selected' : ''}><strong>{entry.title}</strong><span>{entry.size} vB · {entry.rate.toFixed(2)} sat/vB</span></div>)}</div><p>{used.toLocaleString()} / {budget.toLocaleString()} vB used by selected ordinary entries. Your transaction is {selected ? 'selected' : 'not selected'}. This teaching budget excludes the header and coinbase; a real block is limited by weight. Entries are tried by fee rate, skipping those that do not fit. Dependencies and packages are outside this exercise.</p></section>
    <section className="panel mining-card"><span className="output-kicker">02 / REAL HEADER HASHING</span><h2>Try a nonce. Compare the hash.</h2><p>python-bitcoin-utils serializes and double-hashes this 80-byte sample header. Its supplied Merkle root is <strong>not a commitment to the candidate above</strong>. Building that root awaits a library API. This is a standalone proof-of-work exercise, not a valid mined block.</p><div className="mining-controls"><label>Demonstration target<select aria-label="Demonstration target" value={difficulty} onChange={(event) => resetHash(event.target.value as 'easy' | 'harder')}><option value="easy">Easy · about 1 in 16 per try</option><option value="harder">Smaller target · about 1 in 512 per try</option></select></label><button className="primary-button" disabled={runtime.busy || runtime.status.state !== 'ready' || !!result?.found} onClick={() => attempt(1)}>Try next nonce</button><button className="secondary-button" disabled={runtime.busy || runtime.status.state !== 'ready' || !!result?.found} onClick={() => attempt(64)}>Try up to 64 nonces</button><button className="text-button" onClick={() => resetHash()}>Reset hashing</button></div><p>The network determines the required target on a real chain. These easy targets are only for demonstration. A smaller target lowers the chance per attempt; earlier failures do not make the next attempt more likely to succeed.</p>
      <div className="header-inspector" aria-label="80-byte block header"><div className="header-inspector-heading"><div><span>80-BYTE HEADER</span><h3>What gets hashed</h3></div><code>160 hex characters</code></div><div className="header-table" role="table"><div className="header-row header-row-labels" role="row"><span>Field</span><span>Bytes</span><span>Value</span><span>Serialized bytes</span></div>{fields.map(([name, start, end, value, meaning]) => <div key={name + shownNonce} className={`header-row ${name === 'Nonce' ? 'nonce' : ''}`} role="row"><div><strong>{name}</strong><small>{meaning}</small></div><span>{start}–{end - 1}<small>{end - start} B</small></span><code>{value}</code><code>{header.slice(start * 2, end * 2)}</code></div>)}</div></div>
      <div className={`mining-hash-comparison ${result?.found ? 'found' : ''}`} role="status"><div className="comparison-heading"><div><span>DOUBLE SHA-256 RESULT</span><strong>{latest ? result?.found ? 'Hash meets the target' : 'Hash is above the target' : 'Try a nonce to calculate the hash'}</strong></div>{latest && <span>{history.length} {history.length === 1 ? 'attempt' : 'attempts'} · nonce {latest.nonce}</span>}</div><div className="comparison-values"><div><span>Hash · display order</span><code>{latest?.hash ?? '—'}</code></div><div className="comparison-operator"><strong>{latest ? latest.success ? '≤' : '>' : '?'}</strong><span>{latest ? latest.success ? 'valid for this target' : 'keep searching' : 'waiting for a hash'}</span></div><div><span>Demonstration target</span><code>{target}</code><small>nBits {bits}</small></div></div></div>
      {result && latest && <><details className="mining-details"><summary>Nonce attempts ({history.length})</summary><div className="mining-attempts">{history.map((row) => <div key={row.nonce}><span>{row.nonce}</span><code>{row.hash}</code><strong>{row.success ? 'Meets target' : 'Above target'}</strong></div>)}</div></details><details className="mining-details"><summary>Python for the last batch</summary><pre>{result.python}</pre></details></>}
    </section>
    </>}
    {page === 'blocks' && <BlockJourney selected={selected} extraBlocks={extraBlocks} setExtraBlocks={setExtraBlocks} reset={resetChain} />}
    <div className="lesson-sources">Reference: {page === 'blocks' ? <a href="https://github.com/bitcoin/bips/blob/master/bip-0152.mediawiki" target="_blank" rel="noreferrer">BIP 152 · Compact Block Relay</a> : <a href="https://developer.bitcoin.org/devguide/block_chain.html" target="_blank" rel="noreferrer">Blocks and proof of work</a>}</div>
  </div>;
}
