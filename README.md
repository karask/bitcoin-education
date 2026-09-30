# Bit by Bit

A local, browser-native Bitcoin learning lab. Seven address lessons cover legacy,
script-hash, SegWit, nested SegWit, Taproot, and address comparisons with real
Python, synchronized pseudocode, and annotated bytes. Both light and dark themes
are included. A transaction lab builds and signs P2PKH, P2SH multisig, native P2WPKH, native P2WSH multisig, P2SH-P2WPKH, Taproot key-path, and Taproot script-path transactions from editable
UTXOs and outputs, with a field-by-field hex explorer and runnable Python.

## Learning path

The base URL opens a welcome screen with both sidebar groups collapsed. Choose
Addresses or Transactions to enter a path; the logo returns home and closes both
groups. Existing lesson links still open directly.

Append a lesson fragment to `/bitcoin-education/`:

| Fragment | Lesson |
| --- | --- |
| `#home` | Welcome screen and learning-path choices |
| `#p2pkh` | SEC public key → HASH160 → Base58Check |
| `#p2sh` | Multisig redeem script → HASH160 → P2SH |
| `#p2wpkh` | Compressed key → witness v0 program → Bech32 |
| `#p2wsh` | Multisig witness script → SHA-256 → Bech32 |
| `#nested` | P2WPKH redeem script → outer P2SH address |
| `#p2tr` | X-only internal key → TapTweak → output key → Bech32m |
| `#compare` | Six address constructions and locking scripts from one key |
| `#transaction` | Transaction anatomy: UTXOs, outputs, fees, unsigned bytes |
| `#signing` | Legacy/BIP143/BIP341 digests, signatures, scriptSigs/witnesses, signed bytes |
| `#execution` | Seven spending examples with stack traces and failure experiments |
| `#propagation` | Node relay and separate local mempools |
| `#construction` | Candidate selection, BIP34 coinbase, Merkle tree |
| `#mining` | Candidate-root header hashing and nonce attempts |
| `#blocks` | Compact block relay and modeled confirmations |

SegWit inputs use compressed SEC public keys. Taproot starts from a compressed
SEC key and explains its x-only interpretation; the address example has no script
tree. Transactions adds both a no-tree payment and a tree with two or three script leaves. The comparison lab uses `<key> OP_CHECKSIG` for P2SH and P2WSH, making
their common one-key input explicit rather than silently adding multisig keys.

The transaction lab accepts 1–20 inputs and outputs, integer satoshi amounts,
and mainnet or testnet addresses matching the selected spend example. Previous
locks can also be supplied as standard P2PKH, P2SH, P2WPKH, P2WSH, or P2TR script hex. Each example
uses the same type for its outputs; mixed input/output types are not exposed yet. UTXO existence and unspent status are not checked.
The example outpoint is fictional. Version 2, final sequences (editable for Taproot), zero locktime,
and initially empty scriptSigs keep the construction focused on transaction structure.
Previous amounts and scripts are metadata, not serialized input fields. Fees
use supplied amounts; unsigned byte size is not a signed fee-rate estimate.

The signing action uses `PrivateKey.sign_input` for legacy P2PKH/P2SH or `sign_segwit_input`
for the three SegWit v0 examples. Taproot uses `sign_taproot_input`. SIGHASH_ALL is the legacy/v0 default; Taproot uses SIGHASH_DEFAULT. A collapsed explorer before signing
lets each input choose ALL, NONE, SINGLE, or any of those with ANYONECANPAY,
and shows the committed fields and actual library digest. Taproot adds DEFAULT. All seven examples expose
the exact signing preimage. The native explorer shows
ordered BIP143 byte fields, the three component hashes and their serialized
inputs, and which components are zero by the selected SIGHASH rule.
Each 32-byte hex key must match its supplied previous lock. The public example
uses scalar 1; use disposable learning keys, never funded wallet keys. Keys stay
in memory and appear in the displayed/copied Python. Legacy supports both SEC
formats; this native lesson requires compressed keys.

Native signatures go in witness stacks and scriptSigs stay empty. The byte
explorer distinguishes marker, flag, CompactSize witness counts/lengths,
signatures, and public keys. Results show TXID, WTXID, base/total size metadata,
weight, and virtual size. The native unsigned draft uses base serialization
until witness data is added. Tests independently construct all six BIP143 and
legacy preimages, verify ECDSA signatures, strip witness serialization, and
check IDs and weight/vsize. Browser Python is compared with CPython.

Script execution uses the project-local `bitcoin_education.trace_p2pkh_input`, `trace_p2sh_input`,
`trace_p2wpkh_input`, `trace_p2wsh_input`, and `trace_nested_p2wpkh_input` inside the browser worker, built on the core
`bitcoin-utils` APIs. Select an input and step through or play its instructions
with before/after stacks and the CHECKSIG digest. Native execution loads the
witness as stack data, then executes the implied P2PKH scriptCode using BIP143
and the supplied previous amount. Its verdict includes the clean-stack check.
Experiments change a public key, signature byte, or output on a separate copy;
native also offers a wrong-amount experiment. Output edits respect the selected
SIGHASH scope. Legacy P2PKH execution supports SIGHASH_ALL; P2SH supports six legacy modes, and the three SegWit v0 examples support six BIP143
modes including SINGLE without a corresponding output. Taproot supports seven
modes and requires a matching SINGLE output. Compressed
keys are a scope/default-policy restriction for the native tracer; low-S and
NULLFAIL checks are not implemented by the v0 tracers. These scoped evaluators do not provide full node
validation, on-chain UTXO checks, or broadcasting.

One set of seven transaction menu items serves all seven spend examples. A compact
selector follows Addresses order: Legacy P2PKH → P2SH multisig → Native P2WPKH → Native P2WSH → Nested SegWit → Taproot payment → Taproot scripts while preserving each
example’s in-memory draft and results, including across address lessons. Next-step
links connect Anatomy → Signing → Script execution → Propagation → Block construction → Mining → Block propagation.
Directly opening a later
stage offers a signed public example; reload starts a fresh session.

In Propagation, play or step through modeled announcements,
requests, receipts, and admission. Select any of five nodes to inspect its own
mempool; change C's illustrative fee threshold, remove a referenced output at
C, or disconnect E. Added fee competition affects only the selected snapshot.
All seven examples use the same relay diagram and mempool model. The scene uses
actual TXID/WTXID, signed bytes (including witnesses), virtual size, assumed
starting UTXOs, and explicitly modeled validation. Connections are assumed to
have negotiated BIP339 wtxidrelay; inv/getdata use MSG_WTX. No real network broadcast takes place, and the
transaction stays unconfirmed there. Block construction uses `bitcoin-utils`
0.8.7 transaction objects with local `bitcoin_education` helpers to select
transactions by virtual-byte fee rate, build a BIP34 coinbase with subsidy and
assumed fees, and trace every transaction Merkle pair. When selected entries
contain witness data, the candidate also builds a separate WTXID tree with a
zero coinbase leaf, a 32-byte coinbase witness reserved value, and an OP_RETURN
witness commitment. The UI exposes both trees, pair preimages, the commitment
preimage/hash/script, and the final coinbase TXID. Omitting or skipping the
native transaction leaves a legacy candidate when only legacy entries remain.
Changing height or selection changes the coinbase TXID and committed root.
Mining hashes an 80-byte header containing that root with a deliberately easy
target. The previous hash and timestamp are illustrative, so the result is not
a valid block on the selected chain. Block relay and confirmations remain a
separate simulation that assumes a valid block was found. Full block
serialization and contextual validation are not implemented.
The native block relay explains compact-block version 2, WTXID-based short IDs,
witness-bearing transaction delivery, and modeled witness-commitment checks.
The complete former library learning package, including newer native helpers,
now lives in `public/python/bitcoin_education`. Its tests and MIT license moved
with it. All seven spend examples connect Anatomy → Signing → Script execution →
Propagation → Block construction → Mining → Block propagation. The native
execution, exact-preimage, and witness-commitment screens use these local APIs,
without requiring a library release.
See the [native integration notes](docs/native-p2wpkh-library-requirements.md),
[local package docs](public/python/bitcoin_education/README.md), and
[model boundaries](LIBRARY_GAPS.md).

## P2SH multisig transaction journey

P2SH uses the Addresses lesson's 2-of-3 rule and keys for public scalars 1, 2,
and 3. Each input includes its previous P2SH address/script and the redeem-script
hex as metadata. The unsigned input has an empty scriptSig; the output contains
`OP_HASH160 <script hash> OP_EQUAL`. The builder accepts canonical 1/2/3-of-3
rules with three distinct compressed keys and checks their HASH160 commitment.

Enter exactly the required number of matching learning private keys. Any subset
works; signatures are sorted by the public-key order in the redeem script.
Signing uses the core legacy digest with the redeem script as scriptCode,
supporting all six exposed modes. The scriptSig contains `OP_0`, the signatures,
and an `OP_PUSHDATA1` push of the 105-byte redeem script. Three signatures can
make the scriptSig length exceed 252 bytes, so the outer length is CompactSize.
TXID includes these bytes; WTXID equals TXID and each byte has weight four.
The builder rejects legacy SINGLE without a matching output to avoid the
historical constant-digest case.

`bitcoin_education.trace_p2sh_input` traces the push-only scriptSig, the outer
hash check, BIP16 stack restoration, and the multisig rule. CHECKMULTISIG shows
signature-to-key attempts, permits skipped participant keys, and enforces an
empty dummy (BIP147). Experiments alter the redeem script, a signature, an
output, signature order/count, or the dummy. The complete journey continues
through modeled relay, candidate selection, the TXID tree, mining, and block
confirmations. P2SH is a script-hash wrapper; multisig is this lesson's selected
rule, and other redeem scripts are outside the evaluator's scope.

## P2WSH and Nested SegWit transaction journeys

The next two examples complete the same seven stages in Addresses order.
P2WSH reuses the canonical m-of-3 rule: the previous output is
`0020<SHA256(witnessScript)>`. The native scriptSig stays empty. Witness items
are an empty CHECKMULTISIG dummy, signatures in script key order, and the
105-byte witness script. Item lengths are CompactSize; the script is not an
OP_PUSHDATA1 push. BIP143 signs the witness script as scriptCode and the
current previous amount. Witness changes preserve TXID and change WTXID.

Nested SegWit follows the Addresses example, **P2SH-P2WPKH**. The outer P2SH
output commits to HASH160 of `0014<key hash>`. Signing fills the initially empty
scriptSig with exactly one push of that 22-byte redeem program (23 script bytes),
and puts the signature and compressed public key in witness. Adding the program
changes the unsigned draft's TXID; subsequent witness-only changes preserve it.
BIP143 uses the implied P2PKH-style scriptCode, not the outer script or program.

Both include six signature modes and exact preimages, per-input execution,
amount and output experiments, relay using WTXID, virtual-size selection,
witness commitments, and the candidate-root mining and confirmation models.
P2WSH adds signature order/count and dummy experiments; Nested adds altered
redeem-program and extra-scriptSig-item failures. Helpers are deliberately
scoped; the object-based nested trace does not establish raw push canonicality.
Independent tests cover wire bytes, preimages, ECDSA, IDs/weight, all signer
subsets, input alignment, clean stacks, omission, and both Merkle commitments.

The pinned core `P2wshAddress` constructor ignores its `address` argument.
The local `p2wsh_address_to_script` uses the core Bech32 decoder with explicit
network/version/32-byte checks. Copied Python includes this helper; the library
wheel remains intact. See [model boundaries](LIBRARY_GAPS.md).

## Taproot transaction examples

**Taproot payment** uses an x-only internal public key, a no-tree TapTweak,
and `PrivateKey.sign_taproot_input`. DEFAULT commits to all previous amounts,
locks and sequences and every output. The exact epoch/SigMsg fields are shown
before signing and checked against the core BIP341 digest. A default witness
has one 64-byte Schnorr signature; explicit nonzero modes use 65 bytes. TXID
excludes witness; WTXID, weight and vsize include it.

**Taproot scripts** starts with two fixed c0 Tapscript leaves: 2-of-3 co-signers
(public scalars 2, 3 and 4) using CHECKSIG/CHECKSIGADD/NUMEQUAL, and key 5 recovery
after 144 blocks using CHECKSEQUENCEVERIFY. An optional third leaf requires
key 6 plus the hex secret “bit by bit”. The tree is `[co-signers, recovery]`
or `[co-signers, [recovery, secret]]`, so the explorer also shows different
proof depths. These are alternatives; public internal key 1 retains an immediate
key path that can bypass all leaves. This intentionally illustrates Taproot's
key/script distinction rather than a script-only vault policy.

The interactive explorer shows TapLeaf hashes, the root, tweak, output key,
control-block sibling hashes and per-input witness sizes. Selecting a different
tree updates the example lock and matching change address. Each chosen leaf
reveals its script and control block, keeping other scripts hidden.
All seven SIGHASH modes work on key and script paths; SINGLE requires a matching
output. Non-ANYONECANPAY signatures commit to all previous input amounts, locks
and sequences even for NONE/SINGLE. Script signing uses untweaked leaf keys and
a TapLeaf extension. There is no CHECKMULTISIG dummy.

`bitcoin_education.taproot.trace_taproot_input` validates the output-key Schnorr
signature, or reconstructs the script commitment and evaluates only the three
fixed leaves. Explained checks group script operations. Recovery checks version,
sequence flags/type/value and a caller-supplied block-age model; 144 means blocks
elapsed after the modeled UTXO confirms, not a guaranteed wall-clock day. Proof,
leaf, signature, amount, signature-slot order/count, early recovery and wrong-secret
experiments operate on copies. No annex, code separator, upgrade leaves, arbitrary
Tapscript or full contextual node validation is provided. The downstream relay,
block selection and confirmation lessons remain explicitly modeled.

Tests include the published BIP341 wallet signing messages and signatures,
independent tagged leaf/root hashes, all co-signer subsets, timelock boundaries,
invalid signature encodings, all SIGHASH scopes, copied Python, and both runtime
implementations through candidate witness commitments and mining.
The official fixture is from [BIP341 wallet test vectors](https://github.com/bitcoin/bips/blob/master/bip-0341/wallet-test-vectors.json).
The pinned core parser normalizes a nonstandard output script in that fixture;
the reference test preserves its exact wire bytes before checking SINGLE.

## Start locally

Requires Node.js 22.12+ and Python 3.10+ for the one-time asset setup and tests.
Python is **not** used as an application server.

```sh
npm install
npm run setup:runtime
npm run dev
```

Open the localhost URL printed by Vite and append `/bitcoin-education/`. If its default port is occupied:

```sh
npm run dev -- --port 5188
```

The first two commands need internet access. After setup, the application and
all runtime files are served from this computer. No CDN, remote API, external
fonts, analytics, or Python backend are used. Only the theme preference is
stored. The GitHub links are optional outbound navigation.

## Build and verify

```sh
npm run test:python
npm test
npm run build
npm run preview
```

The Python suite checks known address vectors, intermediate values, validation,
field boundaries, and the runnable Python shown to learners. The WebAssembly
suite uses the same locally packaged runtime and compares every result against
native CPython on mainnet/testnet with compressed/uncompressed keys.
P2SH checks also cover 1/2/3-of-3 multisig, key order, output scripts, and an
independent test-only address encoding.
Modern lesson checks include published BIP173 examples, the BIP341 no-script-tree
wallet vector (including the tweak and output key), BIP350 wrong-checksum-family
vectors, five-bit symbol counts/padding, odd-y normalization, network isolation,
and independent test-only Bech32/Bech32m calculations. All modern traces are
also compared between CPython and the pinned WebAssembly runtime.

`dist/` contains a complete static build, including Python and all wheels.
Serve it over HTTP; opening `index.html` through `file://` is not supported by
browser module workers. The production build is mounted at `/bitcoin-education/`
for GitHub Pages.

## GitHub Pages

Every push to `main` runs `.github/workflows/deploy-pages.yml`, builds the app,
enables GitHub Pages when needed, and deploys `dist/`. The expected site URL is
<https://karask.github.io/bitcoin-education/>. If automatic enablement is blocked
by an organization policy, use **Settings → Pages → Source → GitHub Actions**.

## How it works

- React and TypeScript handle presentation, navigation, and animation.
- One module Web Worker owns Pyodide and serializes Python operations.
- `public/python/lesson_adapter.py` composes core library APIs and local helpers.
  Replayable Python construction and validation calls are sent to the code panel.
- `public/python/bitcoin_education` owns educational Script evaluators, Sighash
  traces, and coinbase/Merkle walkthroughs. It is part of this website, with no
  imports from `bitcoinutils.learning`.
- `public/python/manifest.json` lists the Python modules loaded into the browser
  worker and the WebAssembly tests. Add new runtime modules to this manifest.
- To run copied examples that import local helpers, install `bitcoin-utils` and
  run `PYTHONPATH=public/python python3 your_example.py` from the repository root.
- CPython and WebAssembly tests explicitly block the former library learning
  package so a stale wheel cannot hide a missed migration.
- Returned traces contain real bytes and semantic byte ranges. JavaScript
  formats these values; it does not implement Bitcoin algorithms.
- Edited or invalid inputs clear previous results. Request IDs prevent older
  calculations from replacing newer ones.
- Runtime load failures have an in-app restart action.

The P2PKH walkthrough uses the library's SHA-256 helper, RIPEMD-160 reference
implementation, public-key serialization, network constants, and address API.
The P2SH lesson uses `Script` and `P2shAddress` with the same library hash helpers.
Start at `#p2sh` to build a multisig redeem script from three distinct compressed
public keys. Change the threshold or key order, inspect every script byte, and
compare the redeem script, address, and output script. The spending explanation
in the address lesson is conceptual; transaction signing and execution are separate lessons connected by the same
default multisig script and P2SH address.
The final Base58 string is not divided into byte-colored substrings, because
Base58 character positions do not preserve the underlying field boundaries.
Bech32 and Bech32m use a separate five-bit symbol explorer; these values are
never labeled as bytes. Their address views distinguish the network prefix,
separator, witness version, encoded program, and six-character checksum.
Output-script views distinguish witness-version opcodes (`00` or `51`) from
address version values (0 or 1), and distinguish the program from its wrapper.
The interface includes links to the relevant BIPs for each lesson.

## Pinned local runtime

| Component | Version |
| --- | --- |
| Pyodide | 314.0.7 |
| bitcoin-utils | 0.8.7 |
| base58check | 1.0.2 |
| ecdsa | 0.19.2 |
| SymPy | 1.14.0 |
| six | 1.17.0 |
| mpmath | 1.4.1 |

`scripts/prepare_runtime.py` copies Pyodide from the pinned npm package and
downloads universal wheels from PyPI. It checks published SHA-256 digests and
writes a local manifest. The worker checks wheel integrity before loading them.
Generated runtime assets are ignored by Git; run setup when cloning the project.
To update the Bitcoin library, change the version in the setup script, regenerate
the assets, update the displayed version, and run both test suites.

## Future lessons

Live nodes, wallets, and an editable Python console are outside this
first milestone. Missing Bitcoin capabilities should be added to
`python-bitcoin-utils`, not reimplemented in the website.

Known browser limitation: this Pyodide release lacks `hashlib.pbkdf2_hmac`.
Mnemonic-to-seed lessons need a library-owned fallback before they can run.
The P2PKH lesson does not use that function. Node RPC also requires a separately
designed connection strategy; none is included here.

## Third-party software

The application uses React, Vite, TypeScript, Lucide icons, DM Sans, JetBrains
Mono, Pyodide, and the Python packages listed above. Their licenses are retained
in installed packages; Python wheel metadata and license files are preserved
when vendoring. See `THIRD_PARTY_NOTICES.md` for the primary license references.

### Transaction comparison lab

Open `#tx-compare` from Transactions or the home page. Compare compressed-key
P2PKH, P2WPKH, P2SH-P2WPKH and Taproot key-path payments, or compare P2SH,
P2WSH and Taproot 2-of-3 script spends. Every row uses identical outpoints,
amounts and P2WPKH output scripts. Choose 1, 2 or 5 inputs and one output or a
payment plus change. The multisig participants are learning keys 2, 3 and 4;
Taproot spends the co-signer leaf of the existing two-leaf tree and also has
its key and recovery paths. The UI explains this policy difference.

Sizes, unlocking stacks, weight, virtual size and IDs come from signed Python
transactions. Switch between serialized bytes and virtual size, inspect what
is revealed, and flip a signature byte to compare independently calculated
TXID/WTXID results. The edited signature is deliberately invalid. Fee quotes
use a user-chosen hypothetical rate and round up to whole satoshis with decimal
integer arithmetic. They do not rewrite the fixed 1,000-sat reference fee or
estimate current network fees. Exact transaction bytes and reproducible Python
are available for every row.

The comparison's ECDSA signatures are re-encoded with the existing `ecdsa` DER
encoder to remove unnecessary zero padding from the pinned core library's low-S
conversion. The signature integers and sighash are preserved. Tests independently
parse CompactSize and wire sections, hash IDs, execute every input, replay the
Python, check decimal fee rounding, and compare CPython with Pyodide results.
