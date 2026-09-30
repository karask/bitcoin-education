import { useState } from 'react';
import { Layers3 } from 'lucide-react';
import type { MerkleTrace } from './types';

const shortHash = (hex: string) => `${hex.slice(0, 12)}…${hex.slice(-10)}`;

export function MerkleTreeExplorer({ tree, witness = false, leafLabels }: { tree: MerkleTrace; witness?: boolean; leafLabels: string[] }) {
  const [pairIndex, setPairIndex] = useState(0);
  const pair = tree.pairs[pairIndex];
  const name = witness ? 'Witness Merkle' : 'Transaction Merkle';
  return <>
    <div className="merkle-levels" aria-label={`${name} tree levels`}>{tree.levels.map((level, index) => <div key={index}><span>{index === 0 ? `${witness ? 'WTXIDS' : 'TXIDS'} · ${level.length} LEAVES` : index === tree.levels.length - 1 ? 'ROOT' : `LEVEL ${index} · ${level.length} HASHES`}</span><div>{level.map((hash, hashIndex) => <div className="merkle-node" key={hashIndex}><code title={hash}>{shortHash(hash)}</code>{index === 0 && <small>{leafLabels[hashIndex]}</small>}</div>)}</div></div>)}</div>
    {tree.pairs.length > 0 && <><div className="construction-pair-picker" aria-label={`${name} hash pairs`}>{tree.pairs.map((item, index) => <button type="button" key={`${item.level}-${item.index}`} className={pairIndex === index ? 'selected' : ''} aria-pressed={pairIndex === index} onClick={() => setPairIndex(index)}>L{item.level} · pair {item.index + 1}{item.duplicated ? ' · duplicate' : ''}</button>)}</div>{pair && <div className="construction-pair-detail"><span>DOUBLE SHA-256 · LEVEL {pair.level}</span><div><small>LEFT {witness ? 'WTXID' : 'TXID'} / HASH</small><code>{pair.left}</code></div><b>+</b><div><small>RIGHT {pair.duplicated ? '· DUPLICATED ODD NODE' : `${witness ? 'WTXID' : 'TXID'} / HASH`}</small><code>{pair.right}</code></div><div><small>64-BYTE PREIMAGE · INTERNAL BYTE ORDER</small><code>{pair.preimage}</code></div><div className="parent"><small>PARENT HASH · DISPLAY ORDER</small><code>{pair.parent}</code></div></div>}</>}
    <div className="construction-root"><Layers3 size={18} /><div><span>{witness ? 'WITNESS ROOT' : 'MERKLE ROOT'} · DISPLAY ORDER</span><code>{tree.root}</code><small>{witness ? 'Internal bytes used in the witness commitment' : 'Header bytes'}: {tree.root_internal}</small></div></div>
  </>;
}
