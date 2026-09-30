import { useEffect, useState } from 'react';
import type { usePython } from './usePython';
import type { Network, SpendType } from './types';
import './execution.css';

const explanations: Record<string, string> = {
  LOAD_SIGNATURE: 'Load the signature and its SIGHASH byte from the witness. This initializes stack data; it is not a Script opcode.',
  LOAD_PUBLIC_KEY: 'Load the public key above the signature from the witness. The implied P2PKH script now operates on this stack.',
  PUSH_SIGNATURE: 'Push the signature, including its selected SIGHASH byte, onto the stack.',
  PUSH_PUBLIC_KEY: 'Push the public key above the signature. The stack carries into the locking script.',
  OP_DUP: 'Duplicate the top item so the public key remains available for signature verification.',
  OP_HASH160: 'Replace the top item with its SHA-256 then RIPEMD-160 hash. P2SH hashes the revealed redeem script; P2PKH hashes the public key.',
  OP_0: 'Push empty bytes for the extra dummy item consumed by CHECKMULTISIG. NULLDUMMY requires that item to be empty.',
  PUSH_REDEEM_SCRIPT: 'Push the serialized redeem script above the signatures. P2SH first checks its hash against the previous output.',
  PUSH_SCRIPT_HASH: 'Push the redeem-script HASH160 committed to by the previous P2SH output.',
  OP_EQUAL: 'Compare the revealed redeem-script hash with the committed hash and push true or false. P2SH validation requires true before executing the redeem script.',
  RESTORE_STACK: 'Restore the stack saved after scriptSig and remove the redeem script. The dummy and signatures now feed the revealed spending rule.',
  OP_1: 'Push 1: this redeem script requires one signature.',
  OP_2: 'Push 2: this redeem script requires two signatures.',
  OP_3: 'Push 3: in the example redeem script this is the total public-key count; at its start it means three signatures are required.',
  OP_CHECKMULTISIG: 'Read the key and signature counts, match signatures to keys in order, consume the empty dummy, and push true only if every required signature verifies.',
  OP_EQUALVERIFY: 'Remove and compare the two hashes. A mismatch stops execution here.',
  OP_CHECKSIG: 'Verify the signature against this transaction’s input digest and the supplied public key. Push true or false.',
};
export function ScriptExecution({ runtime, hex, scripts, amounts, spendType, network, sighashNames }: {runtime: ReturnType<typeof usePython>; hex: string; scripts: string[]; amounts: number[]; spendType: SpendType; network: Network; sighashNames: string[]}) {
  const native = spendType === 'p2wpkh';
  const multisig = spendType === 'p2sh';
  const [inputIndex, setInputIndex] = useState(0);
  const [experiment, setExperiment] = useState('original');
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { calculate } = runtime;
  useEffect(() => {
    setPosition(0); setPlaying(false);
    calculate({kind: 'execution', publicKey: '', network, compressed: true, execution: {hex, previousScript: scripts[inputIndex], amount: amounts[inputIndex], spendType, inputIndex, experiment}});
  }, [calculate, hex, scripts, amounts, spendType, network, inputIndex, experiment]);
  const result = runtime.trace?.execution;
  const step = result?.steps[position - 1];
  const done = !!result && position >= result.steps.length;
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
    <p>{native ? 'Each input starts with its signature and public key loaded from the witness. The previous output’s version-0 witness program selects an implied P2PKH script, which checks the public-key hash and verifies the BIP143 signature using the previous amount. The scriptSig stays empty.' : multisig ? 'Each input first runs its push-only scriptSig and the previous P2SH locking script to check the redeem-script hash. P2SH validation then restores the saved stack without the script and executes the revealed multisig rule. Signatures use the redeem script as scriptCode for the legacy digest.' : 'Each input runs its own unlocking script followed by the previous output’s locking script.'} Receiving nodes also perform these checks during transaction and block validation.</p>
    <div className="mining-controls"><label>Input<select aria-label="Execution input" value={inputIndex} onChange={e => setInputIndex(Number(e.target.value))}>{scripts.map((_, i) => <option key={i} value={i}>Input {i + 1}</option>)}</select></label><label>Experiment<select aria-label="Execution experiment" value={experiment} onChange={e => setExperiment(e.target.value)}><option value="original">Original signed transaction</option><option value="key">{multisig ? 'Replace a redeem-script public key' : 'Replace the public key'}</option><option value="signature">Alter a signature byte</option><option value="output">Increase output 1 by 1 satoshi</option>{multisig && <><option value="order">Reverse signature order</option><option value="missing">Remove a required signature</option><option value="dummy">Use a nonempty dummy</option></>}{native && <option value="amount">Use the wrong previous amount</option>}</select></label></div>
    <p>Experiments use a separate copy of your signed transaction. They do not re-sign it or change the transaction carried into other lessons.</p>
    {(native || multisig) && <p>Input {inputIndex + 1} was signed with {sighashNames[inputIndex]}. An output edit changes verification only when that output is committed by the selected mode. {native ? 'The current input’s previous amount is committed in all six supported modes.' : 'P2SH uses legacy signing: previous amounts are not committed. Reversing signatures tests key order; for a one-signature rule it leaves the order unchanged.'}</p>}
    {result ? <>{multisig && <div className="execution-context"><div><span>PREVIOUS P2SH LOCK · HASH160 COMMITMENT</span><code>{scripts[inputIndex]}</code></div><div><span>REVEALED REDEEM SCRIPT · {result.required ?? '?'} OF 3</span><code>{result.redeem_script}</code></div></div>}{native && <div className="execution-context"><div><span>WITNESS PROGRAM · PUBLIC-KEY HASH</span><code>{result.witness_program}</code></div><div><span>IMPLIED P2PKH scriptCode</span><code>{result.script_code}</code></div><div><span>SUPPLIED PREVIOUS AMOUNT</span><strong>{result.amount?.toLocaleString()} sats</strong></div></div>}
    <div className="execution-instructions" aria-label="Execution instructions"><button onClick={() => {setPosition(0); setPlaying(false);}} aria-pressed={position === 0}>Start · empty stack</button>{result.steps.map((item, i) => <button key={i} className={position === i + 1 ? 'selected' : ''} aria-pressed={position === i + 1} onClick={() => {setPosition(i + 1); setPlaying(false);}}><small>{item.kind === 'witness_load' ? 'witness · load data' : item.phase}</small>{item.instruction.startsWith('OP_') || item.instruction.startsWith('PUSH_') || item.instruction.startsWith('LOAD_') || item.instruction === 'RESTORE_STACK' ? item.instruction : 'PUSH_PUBLICKEY_HASH'}</button>)}</div>
    <div className="execution-current" aria-live="polite"><span className="output-kicker">{step?.phase ?? 'READY'} · {position} / {result.steps.length}</span><h2>{step ? multisig && step.instruction === 'PUSH_PUBLIC_KEY' ? 'Push a participant’s public key from the redeem script. CHECKMULTISIG uses these keys in their committed order.' : explanations[step.instruction] ?? 'Push the public-key hash committed to by the previous output.' : 'Begin with an empty stack.'}</h2></div>
    <div className="execution-stacks">{stack('Before instruction', step?.stack_before ?? [])}{stack('After instruction', step?.stack_after ?? [])}</div>
    {step?.digest && <div className="execution-digest"><h3>{native ? 'BIP143' : 'Transaction'} signature digest · {result.sighash ?? sighashNames[inputIndex]}</h3><code>{step.digest}</code><p>ECDSA signature verification: {step.signature_valid ? 'passed' : 'failed'}</p></div>}
    {step?.checks && <div className="execution-digest"><h3>CHECKMULTISIG · signature matching</h3><p>Each signature searches forward through the remaining redeem-script public keys. An unused key can be skipped; keys cannot be revisited.</p><table><thead><tr><th>Signature</th><th>Public key</th><th>Result</th></tr></thead><tbody>{step.checks.map((check, i) => <tr key={i}><td>{check.signature}</td><td>{check.publicKey}</td><td>{check.valid ? 'Matched' : 'No match'}</td></tr>)}</tbody></table></div>}
    {done && <div className={`execution-verdict ${result.success ? 'passed' : unsupported ? 'unsupported' : 'failed'}`} role="status"><strong>{result.success ? `This input’s ${native ? 'P2WPKH witness' : multisig ? 'P2SH multisig rule' : 'P2PKH script'} succeeds` : unsupported ? 'This evaluator cannot check that SIGHASH mode yet' : 'Script execution failed'}</strong><p>{result.error ? `${result.error.code}: ${result.error.message}` : native ? 'The final stack contains exactly one item: 01 (true). The clean-stack check passes.' : multisig ? 'The redeem-script hash matched, the required signatures verified in key order, and the dummy was empty. The final stack contains 01 (true).' : 'The final stack contains 01 (true).'}</p></div>}
    <div className="mining-controls"><button className="secondary-button" disabled={position === 0} onClick={() => {setPlaying(false); setPosition(p => p - 1);}}>Previous</button><button className="primary-button" disabled={done} onClick={() => {setPlaying(false); setPosition(p => p + 1);}}>Next instruction</button><button className="secondary-button" disabled={done} onClick={() => setPlaying(!playing)}>{playing && !done ? 'Pause' : 'Play execution'}</button><button className="text-button" onClick={() => {setPosition(0); setPlaying(false);}}>Restart walkthrough</button></div>
    <details className="mining-details"><summary>Python executed for this experiment</summary><p>The bitcoin_education helper is included with this project. To run this example locally, add public/python to your Python module path.</p><pre>{result.python}</pre></details></> : <p role="status">{runtime.error ?? 'Preparing the execution trace…'}</p>}
    <p>Scope: {native ? 'native P2WPKH with ALL, NONE, SINGLE, and their ANYONECANPAY variants. Compressed keys are this tracer’s scope and default-policy restriction, not an unconditional consensus requirement. It does not enforce low-S or NULLFAIL policy.' : multisig ? 'legacy P2SH with a canonical 1, 2, or 3-of-3 compressed-key multisig script, exactly the required signatures, NULLDUMMY, and all six exposed legacy SIGHASH modes. Other redeem scripts and low-S policy checks are outside this evaluator.' : 'standard legacy P2PKH with SIGHASH_ALL.'} This does not establish that a UTXO exists or is unspent, confirm the supplied amount against the chain, or validate the whole transaction, locktime, or all node policies.</p>
  </section>;
}
