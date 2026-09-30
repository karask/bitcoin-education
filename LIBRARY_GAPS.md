# Educational ownership and model boundaries

The browser runtime uses the published `bitcoin-utils 0.8.7` core library together
with this repository's `public/python/bitcoin_education` package. There is no
runtime dependency on `bitcoinutils.learning`. The original wheel is kept intact;
tests prohibit importing its former educational package.

## What moved here

The complete educational package from python-bitcoin-utils commit `71ff0ec` is
now maintained in this project, with its MIT license, dedicated tests, and
historical block fixture. It contains:

- Scoped P2PKH, P2SH multisig, P2WPKH, P2WSH multisig, and P2SH-P2WPKH execution traces.
- BIP143 preimage, component hashes, and byte ranges; each digest is checked
  against the core transaction signer.
- Subsidy and BIP34 coinbase construction helpers.
- Transaction and witness Merkle-tree traces.
- SegWit coinbase witness-commitment construction.

Keys, transaction/script objects, signature generation, digest calculation, and
wire serialization continue to use the core library. The local educational
package owns traced Script evaluation and the teaching algorithms around those
objects. See the [package documentation](public/python/bitcoin_education/README.md)
for API details and copied-example setup.

## Current website integration

The legacy Script execution and candidate-building lessons now call the local
package. All seven spend examples cover the complete seven-stage website journey.
P2SH execution checks the redeem-script commitment, restores the signature
stack, and evaluates a canonical m-of-3 rule with ordered signature matching
and NULLDUMMY. It supports all six exposed legacy SIGHASH modes, with other
redeem scripts and low-S policy outside its scope. Native execution uses witness loading, the implied P2PKH scriptCode, and BIP143
with all six exposed SIGHASH modes. The signing explorer exposes the exact
preimage and component inputs. Candidate construction selects by virtual size,
adds a witness commitment when selected transactions contain witness data, and
passes the final coinbase-based TXID root into mining and modeled block relay.
Adapter tests check execution experiments, both trees, commitment bytes,
selection/omission, and mining-header linkage in CPython and WebAssembly.
See the [native integration notes](docs/native-p2wpkh-library-requirements.md).

## P2WSH and nested integration

P2WSH validates the SHA256 commitment, loads witness data, and shares the scoped
ordered CHECKMULTISIG engine with P2SH, using BIP143 and the supplied amount.
Nested P2SH-P2WPKH validates the outer HASH160 and single pushed program, then
uses the P2WPKH witness evaluator on a copy. All SegWit v0 paths require aligned
witness slots, support six BIP143 modes, and check a single true final item.
The core raw Script parser normalizes pushes, so the nested object trace does
not claim byte-level push canonicality or full consensus validation.

In 0.8.7, `P2wshAddress.__init__` discards both address and witness-program
arguments. The website's `p2wsh_address_to_script` uses the core Bech32 decoder,
checks the current network, witness version zero and 32-byte program, then
constructs the Script. It appears in copied examples and is covered in both
Python runtimes. Core address generation from a witness script still works.

## Taproot integration

The local `taproot` module uses core Schnorr signing/verification, BIP341 digest
calculation, key tweaking, TapLeaf/TapBranch hashing and control-block generation.
It annotates the exact BIP341 message and checks its digest against core. The
version-1 address decoder enforces network, Bech32m checksum and 32-byte program.
The no-tree payment and fixed two/three-leaf examples share the existing seven
journey stages. The scoped evaluator supports the seven modes, key path and
three known c0 leaves, including NULLFAIL and one true final stack item.
Relative recovery additionally checks supplied UTXO age against block sequence.
No annex, code separators, arbitrary scripts, upgrade leaf versions or full node
validation are claimed. Script checks are grouped for presentation.

The official BIP341 signing fixture contains a nonstandard output whose Script
object is normalized by the pinned raw parser. Tests preserve that original
wire script before comparing official messages/signatures. Website transaction
outputs are canonical P2TR scripts and round-trip through the core parser.

## Model boundaries

User-supplied UTXOs are not checked against the chain. Background candidate
transactions have actual serialized bytes, but their previous outputs,
signatures, and fees are assumptions. Candidate selection uses a teaching budget,
not Bitcoin Core's package policy or the consensus block-weight limit.

Mining uses the candidate's Merkle root with an illustrative previous hash,
timestamp, and easy target. Finding a nonce is not mining a valid mainnet/testnet
block. Block propagation assumes a valid block and models node acceptance and
confirmations without transmitting anything or validating a chain.

Full block serialization and UTXO-backed/contextual consensus validation are
outside the current website flow. General-purpose library functionality can be
added upstream when useful independently of the website; educational trace
formats, experiments, and walkthroughs belong here.

## Transaction comparison

The adapter accepts an internal `common_outputs` argument for the comparison
lab, letting its signed spending examples share identical P2WPKH outputs.
Normal transaction lessons keep their existing output validation. Output byte
annotations use the actual comparison lengths. `bitcoin_education.comparison`
provides scenarios and ID experiments composed from the existing signers.

The pinned bitcoin-utils 0.8.7 `_sign_input` low-S conversion can pad a small
negated S integer to 32 bytes, creating nonminimal DER. The default comparison
P2PKH payment exercises this case. Comparison signing re-encodes the same r/s
values with `ecdsa.util.sigencode_der` before placing signatures in the
transaction. This workaround is scoped to comparison signing; no curve math or
signature verification is reimplemented. Every comparison input is checked by
its existing execution tracer in the tests.
