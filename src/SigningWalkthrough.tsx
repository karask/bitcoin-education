import { ArrowRight } from 'lucide-react';
import type { TransactionResult } from './types';

export function SigningWalkthrough({ data }: { data: TransactionResult }) {
  const signing = data.signing;
  if (!signing) return null;
  const native = data.spendType === 'p2wpkh';
  return <section className="panel tx-signing-results" aria-label="Signing walkthrough">
    <span className="output-kicker">FROM EMPTY INPUTS TO SIGNATURES</span><h2>What did we sign?</h2>
    <p>{native
      ? 'For each input, the library calculates the BIP143 digest using a P2PKH-style scriptCode derived from its witness program and the previous output amount. It signs that digest and places the signature and public key in the witness. The scriptSig remains empty.'
      : 'For each input, the library creates a temporary transaction with empty scriptSigs, inserts that input’s previous locking script, applies its selected SIGHASH mode, appends the mode as four bytes, and double-SHA-256 hashes the serialization. This digest is signed; it is not the transaction ID.'}</p>
    <p>{native
      ? 'Every supported SIGHASH mode commits to the amount of the input being signed. If that amount differs from the actual UTXO, the signature will not verify against that UTXO.'
      : 'The selected mode controls which inputs and outputs each signature commits to. Legacy P2PKH signing does not commit to previous input amounts. Changing a supplied amount can change the displayed fee without changing a signature.'}</p>
    {signing.inputs.map((item, index) => <details key={index} open={signing.inputs.length === 1}>
      <summary>Input {index + 1} · {item.sighashName} · digest → signature → {native ? 'witness' : 'scriptSig'}</summary>
      <h4>Signing digest · 32 bytes</h4><code className="tx-selected-hex">{item.digest}</code>
      <h4>Signature · DER + {item.sighashType.toString(16).padStart(2, '0')} ({item.sighashName})</h4><code className="tx-selected-hex">{item.signature}</code>
      <h4>Public key · matched to the supplied {native ? 'P2WPKH' : 'P2PKH'} lock</h4><code className="tx-selected-hex">{item.publicKey}</code>
      {native ? <><h4>Witness stack · signature, then public key</h4>{item.witness.map((value, i) => <code className="tx-selected-hex" key={i}>{i + 1}. {value}</code>)}<h4>scriptSig · empty (0 bytes)</h4></>
        : <><h4>Unlocking script · two data pushes</h4><code className="tx-selected-hex">{item.scriptSig}</code></>}
    </details>)}
    <p>The library created these signatures and the public keys match the supplied locks. This lab does not verify UTXOs on-chain or broadcast transactions.</p>
    {native ? <p>Continue to Script execution to load the witness and verify each input’s BIP143 signature.</p>
      : signing.inputs.some(item => item.sighashType !== 1) ? <p className="tx-sighash-compat">The Script execution lesson’s educational evaluator currently supports SIGHASH_ALL only. It will stop at its mode check for an alternate signature.</p>
        : <p>Continue to Script execution to verify each input’s P2PKH script.</p>}
    <div className="tx-size-comparison"><span>Unsigned <strong>{signing.unsignedBytes} bytes</strong></span><ArrowRight size={20} /><span>Signed <strong>{data.totalSize} bytes</strong></span><span>Fee sizing <strong>{data.vsize} vB</strong></span></div>
    <h4>Signed transaction ID · TXID</h4><code className="tx-selected-hex" data-testid="signed-txid">{data.txid}</code>
    <p>{native ? 'TXID excludes witness data. In this example every input is native P2WPKH, so signing preserves the unsigned TXID.' : 'Legacy scriptSigs are part of the TXID, so signing changes it.'}</p>
    {native && <><h4>Witness transaction ID · WTXID</h4><code className="tx-selected-hex" data-testid="signed-wtxid">{data.wtxid}</code><p>WTXID includes marker, flag, and witness data, so it changes when witnesses change.</p></>}
    <details><summary>Compare the unsigned serialization and ID</summary><h4>Unsigned draft ID</h4><code className="tx-selected-hex">{signing.unsignedTxid}</code><h4>Unsigned hex</h4><code className="tx-selected-hex">{signing.unsignedHex}</code></details>
  </section>;
}
