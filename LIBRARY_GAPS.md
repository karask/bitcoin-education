# Propagation and mining audit

Audited the locally pinned `bitcoin-utils 0.8.5` used by the browser runtime.

## Implemented journey: propagation and mempools

The lesson carries the actual signed serialization and library-generated TXID
into a deterministic local message simulation. Its starting UTXOs are explicitly
assumed to exist. Consensus and signature validation are assumed, not executed.
Only the illustrated fee threshold, missing-input scenario, and disconnection
affect modeled admission. Background mempool entries are labeled fictional
metadata; they have no serialized transactions or manufactured TXIDs.

No Bitcoin cryptographic algorithm or transaction serialization is implemented
in the frontend. Its code schedules illustrative messages and manages views.

## Available in the library

- `Transaction` and `TxInput` / `TxOutput`: construction and serialization;
  legacy signing digests, size, virtual size, and TXID.
- `PrivateKey.sign_input`: legacy signatures; `Script` serializes scriptSigs.
- `BlockHeader`: construction, `serialize_header()`, `get_block_hash()`, and
  `get_target_hex()` for the positive compact targets used in normal examples.
  This is enough to drive a bounded header-hashing experiment with a supplied
  Merkle root and a clearly labeled easy target.
- `Block.from_raw`: parsing and access to transactions and the header.

## Needed for the next stages

1. **Public transaction-signature verification.** A method to verify an ECDSA
   signature against the legacy digest, with clearly documented DER and
   sighash-byte handling. `PublicKey.verify` verifies signed messages, not
   transaction signatures. The signing lesson currently verifies independently
   in tests only.
2. **P2PKH input / Script verification.** To replace assumed node validation,
   evaluate the unlocking and previous locking scripts with explicit consensus
   or policy flags. This is distinct from merely checking an ECDSA signature.
   Full transaction validation additionally needs supplied UTXOs, value checks,
   duplicate/spent-input checks, locktime/sequence context, and contextual rules.
   A narrow, well-specified P2PKH validator would be a useful first API.
3. **Transaction Merkle-root construction.** Build a block transaction Merkle
   root from an ordered list of transaction IDs, handling byte order and
   odd-leaf duplication. Ideally return intermediate levels and mutation
   detection so the lesson can expose the construction. Taproot script-tree
   helpers implement a different construction and cannot substitute for this.
4. **Full block serialization** if the mining lesson is to export and relay a
   complete block. The current `Block` class parses blocks but has no matching
   public serializer. Coinbase transactions can be composed with existing
   transaction/script primitives; block assembly must include correct coinbase
   height encoding, subsidy/fees, and any required witness commitment.

`BlockHeader.get_target_hex()` is not a complete proof-of-work validator: it
does not implement compact-target negative/overflow checks or a contextual
network proof-of-work limit. A generalized validation API should cover these;
a controlled easy-target header experiment can stay within its supported range.

Network latency, illustrative fee policies, and selection among independent
entries can remain simulation logic. They must not be presented as Bitcoin
Core's complete relay, package-selection, replacement, or eviction policy.

The Mining & confirmations lesson now has a real bounded header-hashing
exercise using `BlockHeader` with a supplied sample root, separate from modeled
candidate selection and block acceptance. It never claims that the sample
header commits to the learner's transaction. Transaction inclusion, node
acceptance, and later blocks are explicitly simulated. The candidate budget is
for ordinary transaction virtual bytes only, excluding the header and coinbase;
it is not presented as Bitcoin's full block-weight accounting. Block assembly,
Merkle construction, and consensus validation remain the API gaps above.
