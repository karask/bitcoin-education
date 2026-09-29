# Native P2WPKH: local helpers and remaining integration

This document supersedes the earlier proposal to add more APIs to
`bitcoinutils.learning`. The complete educational package has moved into this
website as `bitcoin_education`, including the native helpers already implemented
in the library checkout at commit `71ff0ec`. No new library release is required
for those helpers. Their [API documentation](../public/python/bitcoin_education/README.md)
and [MIT license](../public/python/bitcoin_education/LICENSE) are preserved.

| Capability | Local API | Website integration |
| --- | --- | --- |
| Native input execution | `trace_p2wpkh_input(tx, input_index, previous_script_pubkey, amount)` | Helper and tests migrated; interactive execution screen still uses legacy P2PKH |
| Exact BIP143 preimage | `trace_segwit_v0_sighash(tx, input_index, script_code, previous_amount, sighash_type)` | Helper and tests migrated; native explorer currently shows digest and scope map |
| SegWit coinbase and commitment | `create_segwit_coinbase_transaction(height, payout_outputs, transactions=..., ...)` | Helper and tests migrated; candidate adapter currently permits legacy transactions |

The migration preserves current website behavior and all existing educational
implementations. Native Anatomy, signing, byte inspection, and shared propagation
already work. The next changes can use these local APIs to complete the native
path, without copying or depending on a library learning subpackage.

## Execution screen

Pass the actual input index, previous locking script, and supplied amount to the
native tracer. Display `witness_load` steps as initial stack data, not scriptSig
push opcodes. Subsequent `scriptCode` steps execute the implied P2PKH script.
Show the selected sighash mode, digest, signature result, and final clean stack.
Support wrong-key, damaged-signature, changed-output, and wrong-amount experiments;
an output edit's effect depends on the signature's SIGHASH mode.

The helper covers all six modes (ALL/NONE/SINGLE, optionally ANYONECANPAY),
including SINGLE without a corresponding output. Compressed-key restrictions
are scoped default policy, not an unconditional consensus claim. It does not
establish UTXO existence, unspent status, amount accuracy, or full node validity.

## Sighash explorer

Show the helper's exact preimage and ordered field ranges, plus hashPrevouts,
hashSequence, and hashOutputs and their serialized inputs. A component disabled
by a SIGHASH rule is zero, not the hash of empty data. Keep the digest agreement
check against the library's signer. This local trace is explanatory; the core
library remains responsible for the actual signature digest used for signing.

## Candidate construction

Use transaction vsize for selection. If any selected transaction contains witness
data, construct the coinbase using the local SegWit helper. It returns the
completed Transaction and a trace: zero coinbase witness leaf, selected WTXIDs,
witness Merkle pairs, reserved value, commitment preimage/hash/script, and output
index. Display that witness tree separately from the ordinary TXID Merkle tree.

Compute the ordinary root using the completed coinbase TXID and selected
transaction TXIDs. Continue into the existing 80-byte header, mining, and block
relay screens. If the native transaction is omitted from a candidate containing
only legacy entries, the ordinary legacy construction remains sufficient.

## Validation already moved

The local helper tests cover the published BIP143 native example, all six modes,
SINGLE edge cases, wrong amounts, malformed witnesses, transaction non-mutation,
odd/even witness trees, mixed legacy/native leaves, nonzero reserved values,
existing commitment outputs, and commitment byte order. Browser tests compare
native execution, preimages, and commitment results with CPython. Both test
runtimes explicitly reject imports of `bitcoinutils.learning`.

References: [BIP141](https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki),
[BIP143](https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki),
[BIP339](https://github.com/bitcoin/bips/blob/master/bip-0339.mediawiki).
