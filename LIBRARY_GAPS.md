# Educational ownership and model boundaries

The browser runtime uses the published `bitcoin-utils 0.8.7` core library together
with this repository's `public/python/bitcoin_education` package. There is no
runtime dependency on `bitcoinutils.learning`. The original wheel is kept intact;
tests prohibit importing its former educational package.

## What moved here

The complete educational package from python-bitcoin-utils commit `71ff0ec` is
now maintained in this project, with its MIT license, dedicated tests, and
historical block fixture. It contains:

- Scoped P2PKH, P2SH multisig, and native P2WPKH execution traces.
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
package. All three spend examples cover the complete seven-stage website journey.
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
