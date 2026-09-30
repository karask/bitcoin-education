# Native P2WPKH: completed local integration

This document supersedes the earlier proposal to add more APIs to
`bitcoinutils.learning`. The complete educational package has moved into this
website as `bitcoin_education`, including the native helpers already implemented
in the library checkout at commit `71ff0ec`. No new library release is required
for those helpers. Their [API documentation](../public/python/bitcoin_education/README.md)
and [MIT license](../public/python/bitcoin_education/LICENSE) are preserved.

| Capability | Local API | Website integration |
| --- | --- | --- |
| Native input execution | `trace_p2wpkh_input(tx, input_index, previous_script_pubkey, amount)` | Interactive witness/Script walkthrough, all six modes, and failure experiments connected |
| Exact BIP143 preimage | `trace_segwit_v0_sighash(tx, input_index, script_code, previous_amount, sighash_type)` | Exact preimage fields and component hash inputs connected to the signing explorer |
| SegWit coinbase and commitment | `create_segwit_coinbase_transaction(height, payout_outputs, transactions=..., ...)` | Candidate selection, witness tree/commitment, final TXID tree, mining, and block relay connected |

Both spend examples now complete the seven-stage learning path: Anatomy,
Signing, Script execution, Propagation, Block construction, Mining, and Block
propagation. Native screens use these local APIs without copying or depending
on a library learning subpackage. Mining and relay retain their teaching-model
boundaries; completing the screens does not add chain-backed validation.

## Execution screen

The adapter passes the actual input index, previous locking script, and supplied
amount to the native tracer. The UI displays `witness_load` steps as initial
stack data, not scriptSig push opcodes. Subsequent `scriptCode` steps execute the
implied P2PKH script.
It shows the selected sighash mode, digest, signature result, and final clean stack.
It supports wrong-key, damaged-signature, changed-output, and wrong-amount experiments;
an output edit's effect depends on the signature's SIGHASH mode.

The helper covers all six modes (ALL/NONE/SINGLE, optionally ANYONECANPAY),
including SINGLE without a corresponding output. Compressed-key restrictions
are scoped default policy, not an unconditional consensus claim. It does not
establish UTXO existence, unspent status, amount accuracy, or full node validity.

## Sighash explorer

The explorer shows the helper's exact preimage and ordered field ranges, plus
hashPrevouts, hashSequence, and hashOutputs and their serialized inputs. A
component disabled by a SIGHASH rule is zero, not the hash of empty data. The
helper checks digest agreement against the library's signer on every trace.
This local trace is explanatory; the core library remains responsible for the
actual signature digest used for signing.

## Candidate construction

The adapter uses transaction vsize for selection. If any selected transaction
contains witness data, it constructs the coinbase using the local SegWit helper.
It returns the completed Transaction and a trace: zero coinbase witness leaf, selected WTXIDs,
witness Merkle pairs, reserved value, commitment preimage/hash/script, and output
index. The UI displays that witness tree separately from the ordinary TXID Merkle tree.

The ordinary root uses the completed coinbase TXID and selected transaction
TXIDs, then feeds the existing 80-byte header, mining, and block relay screens.
If the native transaction is omitted from a candidate containing only legacy
entries, the ordinary legacy construction remains sufficient. Native block
relay explains compact-block version 2 and modeled witness checks; it does not
calculate short IDs or perform full block validation.

## Validation

The local helper tests cover the published BIP143 native example, all six modes,
SINGLE edge cases, wrong amounts, malformed witnesses, transaction non-mutation,
odd/even witness trees, mixed legacy/native leaves, nonzero reserved values,
existing commitment outputs, and commitment byte order. Browser tests compare
native execution, preimages, and commitment results with CPython. Additional
adapter tests cover the screen requests, all execution experiments and modes,
virtual-size selection, omission/skip behavior, and header-root linkage. Both test
runtimes explicitly reject imports of `bitcoinutils.learning`.

References: [BIP141](https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki),
[BIP143](https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki),
[BIP339](https://github.com/bitcoin/bips/blob/master/bip-0339.mediawiki).
