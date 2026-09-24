import { useEffect, useState } from 'react';
import type { CandidateResult, MiningResult } from './types';
import type { usePython } from './usePython';
import './mining.css';

export function MiningLesson({ runtime, txid, fee, vsize, candidate }: {
  runtime: ReturnType<typeof usePython>; txid: string; fee: number; vsize: number; candidate: CandidateResult;
}) {
  const [difficulty, setDifficulty] = useState<'easy' | 'harder'>('easy');
  const [result, setResult] = useState<MiningResult | null>(null);
  const [history, setHistory] = useState<MiningResult['attempts']>([]);
  const [requestPending, setRequestPending] = useState(false);
  useEffect(() => {
    if (requestPending && runtime.trace?.mining) {
      setResult(runtime.trace.mining);
      setHistory((previous) => [...previous, ...runtime.trace!.mining!.attempts]);
      setRequestPending(false);
    }
  }, [runtime.trace, requestPending]);
  useEffect(() => { if (runtime.error) setRequestPending(false); }, [runtime.error]);
  function attempt(count: number) {
    setRequestPending(true);
    runtime.calculate({ kind: 'mining', publicKey: '', compressed: true, network: 'mainnet',
      mining: { startNonce: result?.nextNonce ?? 0, difficulty, count, merkleRoot: candidate.merkle.root } });
  }
  function resetHash(next = difficulty) {
    runtime.invalidate(); setRequestPending(false); setDifficulty(next); setResult(null); setHistory([]);
  }
  const latest = history.at(-1);
  const shownNonce = latest?.nonce ?? 0;
  const target = result?.target ?? (difficulty === 'easy' ? '0fffff' + '0'.repeat(58) : '007fffff' + '0'.repeat(56));
  const bits = result?.bits ?? (difficulty === 'easy' ? '200fffff' : '1f7fffff');
  const nonceHex = shownNonce.toString(16).padStart(8, '0').match(/../g)!.reverse().join('');
  const header = result?.header ?? `02000000${'00'.repeat(32)}${candidate.merkle.root_internal}00f15365${bits.match(/../g)!.reverse().join('')}${nonceHex}`;
  const fields = [
    ['Version', 0, 4, '2', 'Serialized little-endian'], ['Previous block hash', 4, 36, '00…00', 'Illustrative previous block hash'],
    ['Merkle root', 36, 68, candidate.merkle.root.slice(0, 12) + '…', 'Calculated from the candidate’s coinbase and selected transactions'],
    ['Timestamp', 68, 72, '1700000000', 'Fixed teaching timestamp'], ['nBits', 72, 76, bits, 'Demonstration compact target'], ['Nonce', 76, 80, shownNonce.toLocaleString(), 'Four-byte counter; changes each attempt'],
  ] as const;
  return <div className="mining-lesson">
    <div className="journey-identity"><span>HASHING THE CANDIDATE THAT FOLLOWS YOUR SIGNED TXID</span><code>{txid}</code><div><span>{vsize} vB</span><span>{(fee / vsize).toFixed(2)} sat/vB</span><strong>{candidate.selected.includes('yours') ? 'Your transaction is included' : 'Your transaction is not selected'}</strong></div></div>
    <section className="panel mining-card"><span className="output-kicker">01 / REAL HEADER HASHING</span><h2>Try a nonce. Compare the hash.</h2><p>The header commits to the Merkle root you calculated in Block construction. python-bitcoin-utils serializes all 80 bytes and double-hashes them. The previous-block hash, timestamp, and easy target are teaching values, so finding a hash here does not mine a valid chain block.</p><div className="mining-controls"><label>Demonstration target<select aria-label="Demonstration target" value={difficulty} onChange={(event) => resetHash(event.target.value as 'easy' | 'harder')}><option value="easy">Easy · about 1 in 16 per try</option><option value="harder">Smaller target · about 1 in 512 per try</option></select></label><button className="primary-button" disabled={runtime.busy || runtime.status.state !== 'ready' || !!result?.found} onClick={() => attempt(1)}>Try next nonce</button><button className="secondary-button" disabled={runtime.busy || runtime.status.state !== 'ready' || !!result?.found} onClick={() => attempt(64)}>Try up to 64 nonces</button><button className="text-button" onClick={() => resetHash()}>Reset hashing</button></div><p>The network determines the required target on a real chain. A smaller target lowers the chance per attempt; earlier failures do not make the next attempt more likely to succeed.</p>
      <div className="header-inspector" aria-label="80-byte block header"><div className="header-inspector-heading"><div><span>80-BYTE HEADER</span><h3>What gets hashed</h3></div><code>160 hex characters</code></div><div className="header-table" role="table"><div className="header-row header-row-labels" role="row"><span>Field</span><span>Bytes</span><span>Value</span><span>Serialized bytes</span></div>{fields.map(([name, start, end, value, meaning]) => <div key={name + shownNonce} className={`header-row ${name === 'Nonce' ? 'nonce' : name === 'Merkle root' ? 'committed' : ''}`} role="row"><div><strong>{name}</strong><small>{meaning}</small></div><span>{start}–{end - 1}<small>{end - start} B</small></span><code>{value}</code><code>{header.slice(start * 2, end * 2)}</code></div>)}</div></div>
      <div className={`mining-hash-comparison ${result?.found ? 'found' : ''}`} role="status"><div className="comparison-heading"><div><span>DOUBLE SHA-256 RESULT</span><strong>{latest ? result?.found ? 'Hash meets the target' : 'Hash is above the target' : 'Try a nonce to calculate the hash'}</strong></div>{latest && <span>{history.length} {history.length === 1 ? 'attempt' : 'attempts'} · nonce {latest.nonce}</span>}</div><div className="comparison-values"><div><span>Hash · display order</span><code>{latest?.hash ?? '—'}</code></div><div className="comparison-operator"><strong>{latest ? latest.success ? '≤' : '>' : '?'}</strong><span>{latest ? latest.success ? 'valid for this target' : 'keep searching' : 'waiting for a hash'}</span></div><div><span>Demonstration target</span><code>{target}</code><small>nBits {bits}</small></div></div></div>
      {result && latest && <><details className="mining-details"><summary>Nonce attempts ({history.length})</summary><div className="mining-attempts">{history.map((row) => <div key={row.nonce}><span>{row.nonce}</span><code>{row.hash}</code><strong>{row.success ? 'Meets target' : 'Above target'}</strong></div>)}</div></details><details className="mining-details"><summary>Python for the last batch</summary><pre>{result.python}</pre></details></>}
    </section>
    <div className="lesson-sources">Reference: <a href="https://developer.bitcoin.org/devguide/block_chain.html" target="_blank" rel="noreferrer">Blocks and proof of work</a></div>
  </div>;
}
