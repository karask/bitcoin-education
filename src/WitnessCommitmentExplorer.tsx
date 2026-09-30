import type { CandidateResult } from './types';
import { MerkleTreeExplorer } from './MerkleTreeExplorer';

export function WitnessCommitmentExplorer({ candidate }: { candidate: CandidateResult }) {
  const trace = candidate.witnessCommitment;
  if (!trace) return null;
  const labels = ['Coinbase · zero leaf', ...candidate.selected.map(id => {
    const entry = candidate.entries.find(item => item.id === id)!;
    return `${entry.label} · ${entry.hasWitness ? 'WTXID' : 'TXID = WTXID'}`;
  })];
  return <section className="panel mining-card construction-card witness-commitment" aria-label="SegWit witness commitment">
    <span className="output-kicker">03 / COMMIT TO THE WITNESS DATA</span><h2>Witness data reaches the header.</h2>
    <p>This candidate includes a transaction with witness data. Build a separate tree from the selected WTXIDs in block order. Its first leaf is 32 zero bytes for the coinbase, which avoids a circular dependency on the coinbase’s own witness commitment. Legacy entries use TXID = WTXID.</p>
    <MerkleTreeExplorer tree={trace.witness_tree} witness leafLabels={labels} />
    <h3>Combine the root with the reserved value.</h3>
    <p>The coinbase input’s witness holds one 32-byte reserved value, set to zero in this example. Double SHA-256 of the witness root’s internal bytes followed by this value produces the commitment hash.</p>
    <div className="construction-detail-grid"><div><span>Witness reserved value · 32 bytes</span><code>{trace.witness_reserved_value}</code></div><div><span>Commitment preimage · 64 bytes</span><code>{trace.commitment_preimage}</code></div><div><span>Commitment hash · double SHA-256</span><code>{trace.commitment_hash}</code></div></div>
    <h3>Store the commitment in the coinbase.</h3>
    <p>Coinbase output {trace.commitment_output_index + 1} (index {trace.commitment_output_index}) carries zero satoshis and this OP_RETURN script. The prefix 6a24aa21a9ed identifies the commitment; the following 32 bytes hold its hash. The highest-index matching output is authoritative.</p>
    <code className="tx-selected-hex" data-testid="witness-commitment-script">{trace.commitment_script}</code>
    <div className="tx-serialization-path"><span>Selected WTXIDs</span><span>Witness root</span><span>Coinbase commitment output</span><span>Coinbase TXID</span><span>Header Merkle root</span></div>
    <p>The ordinary TXID tree below uses the completed coinbase, so the block header commits to witness data through that coinbase TXID.</p>
  </section>;
}
