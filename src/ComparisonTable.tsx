import type { LessonTrace } from './types';

export function ComparisonTable({ rows, current, select }: { rows: NonNullable<LessonTrace['comparisons']>; current: number; select: (index: number) => void }) {
  return <section className="comparison-card panel" aria-label="Address comparison">
    <h2>Same key, different commitments</h2>
    <p>The P2SH and P2WSH rows use a single-key <code>&lt;key&gt; OP_CHECKSIG</code> script so every row starts from the one key above. The dedicated script lessons use 2-of-3 multisig instead.</p>
    <div className="comparison-scroll" tabIndex={0} aria-label="Scrollable address comparison table"><table><thead><tr><th>Construction</th><th>Address / encoding</th><th>Commits to</th><th>Script bytes</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.type} className={i === current ? 'selected' : ''}><th><button onClick={() => select(i)} aria-pressed={i === current}>{row.type}<span>Inspect ↓</span></button></th><td><code>{row.address}</code><small>{row.encoding}</small></td><td>{row.commitment}</td><td>{row.scriptBytes}</td></tr>)}</tbody></table></div>
    <p className="comparison-spending"><strong>{rows[current].type} spending: </strong>{rows[current].spending}</p>
    <p>Sizes measure the raw locking scripts, excluding transaction length prefixes. They do not measure spending cost or transaction fees. Changing the network changes address encoding; the locking scripts stay the same.</p>
  </section>;
}
