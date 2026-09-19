import { ArrowRight, ChevronDown, RotateCcw } from 'lucide-react';
import type { LessonInput } from './types';

export function MultisigBuilder({ input, keys, dirty, error, edit, commit, restore }: {
  input: LessonInput; keys: string[]; dirty: boolean; error: string | null;
  edit: (keys: string[]) => void; commit: (changes?: Partial<LessonInput>) => void; restore: () => void;
}) {
  const witness = input.kind === 'p2wsh';
  return <section className="input-card multisig-builder" aria-label={`${witness ? 'P2WSH' : 'P2SH'} spending rule`}>
    <div className="input-card-heading"><div><span className="section-index">01</span><h2>Choose a spending rule</h2></div><button className="text-button" onClick={restore}><RotateCcw size={13} />Use example</button></div>
    <form onSubmit={(event) => { event.preventDefault(); commit(); }}>
      <div className="rule-controls">
        <div className="threshold-control"><label htmlFor="threshold">Require</label><select id="threshold" value={input.threshold} onChange={(event) => commit({ threshold: Number(event.target.value) })}>{[1, 2, 3].map((n) => <option value={n} key={n}>{n}</option>)}</select><span>of these <strong>3 keys</strong> to authorize spending.</span></div>
        <div className="input-options"><div><label htmlFor="network">Network</label><div className="select-wrap"><span className={`network-dot ${input.network}`} /><select id="network" value={input.network} onChange={(event) => commit({ network: event.target.value as LessonInput['network'] })}><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select><ChevronDown size={13} /></div></div></div>
      </div>
      <div className="participant-grid">{['Alice', 'Bob', 'Carol'].map((name, index) => <div className={`participant-card field-participant-${index}`} key={name}>
        <label htmlFor={`key-${index}`}><span className="participant-avatar">{name[0]}</span><strong>{name}</strong><span>PUBLIC KEY {index + 1}</span></label>
        <textarea id={`key-${index}`} aria-label={`${name} public key`} aria-describedby="multisig-key-help" spellCheck={false} autoComplete="off" rows={3} value={keys[index]} onChange={(event) => edit(keys.map((key, i) => i === index ? event.target.value : key))} />
      </div>)}</div>
      <div className="builder-actions"><p id="multisig-key-help">Compressed SEC keys · 33 bytes each · public learning data</p><button className="text-button" type="button" onClick={() => commit({ publicKeys: [keys[1], keys[0], keys[2]] })}>Swap Alice / Bob keys</button><button className="primary-button" type="submit">{dirty ? 'Apply changes' : 'Build address'}<ArrowRight size={14} /></button></div>
    </form>
    <div className="rule-preview"><span className="eyebrow">THE {witness ? 'WITNESS' : 'REDEEM'} SCRIPT · SYMBOLIC VIEW</span><code><span>OP_{input.threshold}</span>{['Alice', 'Bob', 'Carol'].map((name, i) => <span className={`rule-key field-participant-${i}`} key={name}>&lt;{name}’s key&gt;</span>)}<span>OP_3</span><span>OP_CHECKMULTISIG</span></code><p>{witness ? 'P2WSH uses SHA-256 of this script as its witness program.' : 'P2SH commits to a script. Multisig is one possible spending rule.'}</p></div>
    {error && <p className="input-error" role="alert">{error}</p>}
    {dirty && <p className="draft-notice">Apply your changes to calculate the new script and address.</p>}
  </section>;
}
