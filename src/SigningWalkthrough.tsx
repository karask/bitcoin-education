import { ArrowRight } from 'lucide-react';
import type { TransactionResult } from './types';

export function SigningWalkthrough({ data }: { data: TransactionResult }) {
  const signing = data.signing;
  if (!signing) return null;
  const wsh = data.spendType === 'p2wsh';
  const nested = data.spendType === 'nested';
  const segwit = ['p2wpkh', 'p2wsh', 'nested'].includes(data.spendType);
  const multisig = data.spendType === 'p2sh' || wsh;
  return <section className="panel tx-signing-results" aria-label="Signing walkthrough">
    <span className="output-kicker">FROM EMPTY INPUTS TO SIGNATURES</span><h2>What did we sign?</h2>
    <p>{wsh ? 'Each participant signs a BIP143 digest with the witness script as scriptCode and the previous output amount. The witness reveals an empty CHECKMULTISIG dummy, signatures in script key order, and the script containing all participant keys. The native scriptSig stays empty.'
      : nested ? 'The outer P2SH output commits to a P2WPKH witness program. The library pushes that program into scriptSig, then signs with BIP143 using the implied P2PKH-style scriptCode and previous output amount. The signature and compressed public key go in witness.'
      : segwit ? 'For each input, the library calculates the BIP143 digest using a P2PKH-style scriptCode derived from its witness program and the previous output amount. It signs that digest and places the signature and public key in witness. The scriptSig remains empty.'
      : multisig ? 'Each required participant signs the legacy digest with the multisig redeem script as scriptCode. The scriptSig reveals an empty dummy, signatures in script key order, and the redeem script. The outer HASH160 locking script is not the signing scriptCode.'
      : 'The library creates a temporary transaction with empty scriptSigs, inserts the current input’s previous locking script, applies its selected SIGHASH mode, appends the four-byte mode, and double-SHA-256 hashes the serialization. This signing digest differs from the transaction ID.'}</p>
    <p>{segwit ? 'Every supported SIGHASH mode commits to the amount of the input being signed. If that amount differs from the actual UTXO, the signature will not verify against that UTXO.' : 'Legacy signing does not commit to previous input amounts. Changing a supplied amount can change the displayed fee without changing a signature.'}</p>
    {signing.inputs.map((item, index) => <details key={index} open={signing.inputs.length === 1}>
      <summary>Input {index + 1} · {item.sighashName} · digest → signature → {segwit ? 'witness' : 'scriptSig'}</summary>
      <h4>Signing digest · 32 bytes</h4><code className="tx-selected-hex">{item.digest}</code>
      {multisig ? <><h4>{item.required} signatures · {item.sighashName} · script key order</h4>{item.signatures?.map((value, i) => <div key={i}><h4>Signature {i + 1} · participant key {item.signerIndexes?.[i]}</h4><code className="tx-selected-hex">{value}</code><h4>Participant public key</h4><code className="tx-selected-hex">{item.publicKeys?.[i]}</code></div>)}<h4>Revealed {wsh ? 'witness' : 'redeem'} script · 105 bytes</h4><code className="tx-selected-hex">{wsh ? item.witnessScript : item.redeemScript}</code></>
        : <><h4>Signature · DER + {item.sighashType.toString(16).padStart(2, '0')} ({item.sighashName})</h4><code className="tx-selected-hex">{item.signature}</code><h4>Public key · matched to the supplied lock</h4><code className="tx-selected-hex">{item.publicKey}</code></>}
      {segwit ? <><h4>Witness stack · {wsh ? 'empty dummy, signatures, witness script' : 'signature, public key'}</h4>{item.witness.map((value, i) => <code className="tx-selected-hex" key={i}>{i + 1}. {value || '(empty dummy · 0 bytes)'}</code>)}<h4>scriptSig · {nested ? 'single pushed witness program · 23 bytes' : 'empty · 0 bytes'}</h4>{nested && <><code className="tx-selected-hex">{item.scriptSig}</code><h4>Redeem program · 22 bytes</h4><code className="tx-selected-hex">{item.redeemScript}</code><p>The first scriptSig byte, 16, pushes 22 bytes. This program selects witness validation; it is not the BIP143 scriptCode.</p></>}</>
        : <><h4>scriptSig · {multisig ? 'OP_0 + signatures + redeem script' : 'signature + public key'}</h4><code className="tx-selected-hex">{item.scriptSig}</code>{multisig && <p>OP_0 supplies the empty extra item consumed by CHECKMULTISIG. The 105-byte redeem-script push uses OP_PUSHDATA1.</p>}</>}
    </details>)}
    <p>The library created these signatures and the public keys match the supplied locks. This lab does not verify UTXOs on-chain or broadcast transactions.</p>
    <p>Continue to Script execution to verify the spending condition and experiment with signature commitments.</p>
    <div className="tx-size-comparison"><span>Unsigned <strong>{signing.unsignedBytes} bytes</strong></span><ArrowRight size={20} /><span>Signed <strong>{data.totalSize} bytes</strong></span><span>Fee sizing <strong>{data.vsize} vB</strong></span></div>
    <h4>Signed transaction ID · TXID</h4><code className="tx-selected-hex" data-testid="signed-txid">{data.txid}</code>
    <p>{nested ? 'TXID includes the redeem-program push in scriptSig. Adding it changes this unsigned draft’s TXID. Once that program is present, changing only witness signatures changes WTXID while preserving TXID.' : segwit ? 'TXID excludes witness data. These native inputs keep empty scriptSigs, so signing preserves the unsigned TXID.' : 'Legacy scriptSigs are part of the TXID, so signing changes it.'}</p>
    {segwit && <><h4>Witness transaction ID · WTXID</h4><code className="tx-selected-hex" data-testid="signed-wtxid">{data.wtxid}</code><p>WTXID includes marker, flag, and witness data, so it changes when witnesses change.</p></>}
    <details><summary>Compare the unsigned serialization and ID</summary><h4>Unsigned draft ID</h4><code className="tx-selected-hex">{signing.unsignedTxid}</code><h4>Unsigned hex</h4><code className="tx-selected-hex">{signing.unsignedHex}</code></details>
  </section>;
}
