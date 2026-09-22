import { useEffect, useState } from 'react';
import { ArrowRight, Network, Pause, Play, RotateCcw } from 'lucide-react';
import { advanceBlockWave, initialBlockSimulation, LINKS, NODES } from './blockSimulation';
import type { BlockNodeStatus } from './blockSimulation';
import './journey.css';

const STATUS: Record<BlockNodeStatus, string> = {
  unseen: 'Waiting for block', announced: 'Block announced', reconstructing: 'Requesting missing txs', checking: 'Validating block', accepted: 'Block accepted',
};

export function BlockJourney({ selected, extraBlocks, setExtraBlocks, reset }: {
  selected: boolean; extraBlocks: number; setExtraBlocks: (update: (count: number) => number) => void; reset: () => void;
}) {
  const [state, setState] = useState(initialBlockSimulation);
  const [playing, setPlaying] = useState(false);
  const [selectedNode, setSelectedNode] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('A');
  const waveLogs = state.logs.filter((log) => log.wave === state.wave);
  const accepted = NODES.filter(({ id }) => state.nodes[id] === 'accepted').length;
  const confirmations = selected && state.nodes.A === 'accepted' ? 1 + extraBlocks : 0;
  useEffect(() => {
    if (!playing || !state.queue.length) return;
    const timer = setTimeout(() => setState((previous) => advanceBlockWave(previous)), 1200);
    return () => clearTimeout(timer);
  }, [playing, state.queue]);
  function restart() { setPlaying(false); setState(initialBlockSimulation()); reset(); }
  return <section className="panel mining-card block-journey" aria-label="Compact block propagation simulation">
    <div className="journey-heading"><div><span className="output-kicker">01 / COMPACT BLOCK RELAY</span><h2>A block arrives.<br /><span>Nodes decide.</span></h2></div><span className="journey-badge"><Network size={14} />LOCAL SIMULATION</span></div>
    <p>Node D represents the pool node that found the candidate. Its peers negotiated compact-block support earlier with <code>sendcmpct</code>. Watch compact announcements travel in parallel while every receiver reconstructs and validates the block independently.</p>
    <div className="journey-controls"><div><button className="primary-button" disabled={!state.queue.length} onClick={() => setPlaying(!playing)}>{playing && state.queue.length ? <Pause size={14} /> : <Play size={14} />}{playing && state.queue.length ? 'Pause relay' : state.logs.length ? 'Play relay' : 'Start block relay'}</button><button className="secondary-button" disabled={!state.queue.length} onClick={() => { setPlaying(false); setState((previous) => advanceBlockWave(previous)); }}>Next wave<ArrowRight size={14} /></button><button className="icon-button" aria-label="Restart block relay" onClick={restart}><RotateCcw size={16} /></button></div><span>{state.queue.length ? `${state.wave} ${state.wave === 1 ? 'wave' : 'waves'} · ${state.logs.length} messages` : `Settled after ${state.wave} waves`}</span></div>
    <div className="journey-map" aria-label="Block relay peer connections"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{LINKS.map(([a, b]) => { const start = NODES.find((node) => node.id === a)!; const end = NODES.find((node) => node.id === b)!; const active = waveLogs.some(({ message }) => message.from !== message.to && ((message.from === a && message.to === b) || (message.from === b && message.to === a))); return <line key={a + b} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={active ? 'active' : ''} />; })}</svg>{NODES.map((node) => <button key={node.id} style={{ left: `${node.x}%`, top: `${node.y}%` }} className={`journey-node node-${state.nodes[node.id]} ${selectedNode === node.id ? 'selected' : ''}`} aria-label={`Node ${node.id}: ${STATUS[state.nodes[node.id]]}`} aria-pressed={selectedNode === node.id} onClick={() => setSelectedNode(node.id)}><span>{node.id}</span><strong>{node.id === 'D' ? 'Pool node' : node.name}</strong><small>{STATUS[state.nodes[node.id]]}</small></button>)}<span className="journey-map-caption">Active links show every P2P message in the current parallel wave.</span></div>
    <div className="journey-event" role="status"><span>{state.wave ? `WAVE ${String(state.wave).padStart(2, '0')} · ${waveLogs.length} ${waveLogs.length === 1 ? 'MESSAGE' : 'MESSAGES'}` : 'COMPACT RELAY READY'}</span>{waveLogs.length ? <ul>{waveLogs.map((log, index) => <li key={index}>{log.text}</li>)}</ul> : <p>Node D has the block. Start relay to send <code>cmpctblock</code> to its connected peers.</p>}</div>
    <div className="block-message-key"><div><code>sendcmpct</code><span>Negotiated earlier per connection</span></div><div><code>cmpctblock</code><span>Header, short transaction IDs, and prefilled transactions</span></div><div><code>getblocktxn</code><span>Request transactions missing from local reconstruction</span></div><div><code>blocktxn</code><span>Return the requested full transactions</span></div></div>
    <section className="journey-decision" aria-label="Selected node block state"><span className="output-kicker">NODE {selectedNode} / INDEPENDENT VIEW</span><h3>{STATUS[state.nodes[selectedNode]]}</h3><p>{state.nodes[selectedNode] === 'accepted' ? 'This node has accepted the block into its best chain in the simulation. It updates its UTXO set and removes included transactions from its local mempool.' : state.nodes[selectedNode] === 'reconstructing' ? 'This node lacks some advertised transactions locally. It must obtain them before it can reconstruct and validate the complete block.' : state.nodes[selectedNode] === 'checking' ? 'Reconstruction is complete. Header, proof of work, Merkle commitment, transactions, scripts, and other consensus rules are modeled as being checked independently.' : 'This node has not accepted the block yet.'}</p></section>
    <div className="mining-chain" aria-label="Simulated chain at node A"><div>Previous tip</div><span>→</span>{state.nodes.A === 'accepted' ? <><div className={selected ? 'included' : ''}>Accepted block<small>{selected ? 'Contains your transaction' : 'Excludes your transaction'}</small></div>{extraBlocks > 0 && <><span>→</span><div>+{extraBlocks} blocks<small>Built on this block</small></div></>}</> : <div>Waiting for node A</div>}</div>
    <div className="mining-controls"><button className="primary-button" disabled={state.nodes.A !== 'accepted' || extraBlocks >= 5} onClick={() => setExtraBlocks((count) => count + 1)}>Simulate next block at A</button><button className="text-button" onClick={restart}>Reset block simulation</button></div>
    <p>Node A reports <strong>{confirmations} confirmations</strong> for your transaction. Inclusion gives the first; each later block on that chain adds one. The {accepted} accepted node views are local, and a reorganization could later reduce confirmation depth.</p>
    <details className="journey-history"><summary>Replay the block message log ({state.logs.length})</summary><ol>{state.logs.map((log, index) => <li key={index}><span>Wave {log.wave}</span>{log.text}</li>)}</ol></details>
  </section>;
}
