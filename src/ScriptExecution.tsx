import { useEffect, useState } from 'react';
import type { usePython } from './usePython';
import './execution.css';

const explanations: Record<string, string> = {
  PUSH_SIGNATURE: 'Push the signature, including its selected SIGHASH byte, onto the stack.',
  PUSH_PUBLIC_KEY: 'Push the public key above the signature. The stack carries into the locking script.',
  OP_DUP: 'Duplicate the top item so the public key remains available for signature verification.',
  OP_HASH160: 'Replace the duplicated public key with its SHA-256 then RIPEMD-160 hash.',
  OP_EQUALVERIFY: 'Remove and compare the two hashes. A mismatch stops execution here.',
  OP_CHECKSIG: 'Verify the signature against this transaction’s input digest and the supplied public key. Push true or false.',
};
export function ScriptExecution({ runtime, hex, scripts }: {runtime: ReturnType<typeof usePython>; hex: string; scripts: string[]}) {
  const [inputIndex, setInputIndex] = useState(0);
  const [experiment, setExperiment] = useState('original');
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { calculate } = runtime;
  useEffect(() => {
    setPosition(0); setPlaying(false);
    calculate({kind: 'execution', publicKey: '', network: 'mainnet', compressed: true, execution: {hex, previousScript: scripts[inputIndex], inputIndex, experiment}});
  }, [calculate, hex, scripts, inputIndex, experiment]);
  const result = runtime.trace?.execution;
  const step = result?.steps[position - 1];
  const done = !!result && position === result.steps.length;
  const unsupported = result?.error?.code === 'UNSUPPORTED_SIGHASH';
  useEffect(() => {
    if (!playing || !result || done) return;
    const timer = setTimeout(() => setPosition(p => p + 1), 1300);
    return () => clearTimeout(timer);
  }, [playing, result, position, done]);
  function stack(title: string, values: string[]) {
    return <section className="execution-stack"><h3>{title}</h3><span className="output-kicker">TOP OF STACK</span><div>{[...values].reverse().map((value, i) => <code key={i}>{value === '' ? '(empty bytes · false)' : value === '01' ? '01 · true' : value}</code>)}{!values.length && <p>Empty stack</p>}</div><small>{values.length} items · raw hexadecimal bytes</small></section>;
  }
  return <section className="panel execution-lesson">
    <p>Each input runs its own unlocking script followed by the previous output’s locking script. Receiving nodes also perform these checks during transaction and block validation.</p>
    <div className="mining-controls"><label>Input<select aria-label="Execution input" value={inputIndex} onChange={e => setInputIndex(Number(e.target.value))}>{scripts.map((_, i) => <option key={i} value={i}>Input {i + 1}</option>)}</select></label><label>Experiment<select aria-label="Execution experiment" value={experiment} onChange={e => setExperiment(e.target.value)}><option value="original">Original signed transaction</option><option value="key">Replace the public key</option><option value="signature">Alter a signature byte</option><option value="output">Increase output 1 by 1 satoshi</option></select></label></div>
    <p>Experiments use a separate copy of your signed transaction. They do not re-sign it or change the transaction carried into other lessons.</p>
    {result ? <><div className="execution-instructions" aria-label="Execution instructions"><button onClick={() => {setPosition(0); setPlaying(false);}} aria-pressed={position === 0}>Start · empty stack</button>{result.steps.map((item, i) => <button key={i} className={position === i + 1 ? 'selected' : ''} aria-pressed={position === i + 1} onClick={() => {setPosition(i + 1); setPlaying(false);}}><small>{item.phase}</small>{item.instruction.startsWith('OP_') || item.instruction.startsWith('PUSH_') ? item.instruction : 'PUSH_PUBLICKEY_HASH'}</button>)}</div>
    <div className="execution-current" aria-live="polite"><span className="output-kicker">{step?.phase ?? 'READY'} · {position} / {result.steps.length}</span><h2>{step ? explanations[step.instruction] ?? 'Push the public-key hash committed to by the previous output.' : 'Begin with an empty stack.'}</h2></div>
    <div className="execution-stacks">{stack('Before instruction', step?.stack_before ?? [])}{stack('After instruction', step?.stack_after ?? [])}</div>
    {step?.digest && <div className="execution-digest"><h3>Transaction signature digest · SIGHASH_ALL</h3><code>{step.digest}</code><p>ECDSA signature verification: {step.signature_valid ? 'passed' : 'failed'}</p></div>}
    {done && <div className={`execution-verdict ${result.success ? 'passed' : unsupported ? 'unsupported' : 'failed'}`} role="status"><strong>{result.success ? 'This input’s P2PKH script succeeds' : unsupported ? 'This evaluator cannot check that SIGHASH mode yet' : 'Script execution failed'}</strong><p>{result.error ? `${result.error.code}: ${result.error.message}` : 'The final stack contains 01 (true).'}</p></div>}
    <div className="mining-controls"><button className="secondary-button" disabled={position === 0} onClick={() => {setPlaying(false); setPosition(p => p - 1);}}>Previous</button><button className="primary-button" disabled={done} onClick={() => {setPlaying(false); setPosition(p => p + 1);}}>Next instruction</button><button className="secondary-button" disabled={done} onClick={() => setPlaying(!playing)}>{playing && !done ? 'Pause' : 'Play execution'}</button><button className="text-button" onClick={() => {setPosition(0); setPlaying(false);}}>Restart walkthrough</button></div>
    <details className="mining-details"><summary>Python executed for this experiment</summary><pre>{result.python}</pre></details></> : <p role="status">{runtime.error ?? 'Preparing the library execution trace…'}</p>}
    <p>Scope: the library’s educational evaluator supports standard legacy P2PKH with SIGHASH_ALL. This does not establish that a UTXO exists or is unspent, or validate transaction amounts, locktime, or all node policies.</p>
  </section>;
}
