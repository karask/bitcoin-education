# Bit by Bit

A local, browser-native Bitcoin learning lab. Seven address lessons cover legacy,
script-hash, SegWit, nested SegWit, Taproot, and address comparisons with real
Python, synchronized pseudocode, and annotated bytes. Both light and dark themes
are included. A transaction lab builds and signs P2PKH transactions from editable
UTXOs and outputs, with a field-by-field hex explorer and runnable Python.

## Learning path

Append a lesson fragment to `/bitcoin-education/`:

| Fragment | Lesson |
| --- | --- |
| `#p2pkh` | SEC public key → HASH160 → Base58Check |
| `#p2sh` | Multisig redeem script → HASH160 → P2SH |
| `#p2wpkh` | Compressed key → witness v0 program → Bech32 |
| `#p2wsh` | Multisig witness script → SHA-256 → Bech32 |
| `#nested` | P2WPKH redeem script → outer P2SH address |
| `#p2tr` | X-only internal key → TapTweak → output key → Bech32m |
| `#compare` | Six address constructions and locking scripts from one key |
| `#transaction` | Transaction anatomy: UTXOs, outputs, fees, unsigned bytes |
| `#signing` | P2PKH digests, signatures, scriptSigs, signed bytes |
| `#execution` | P2PKH instruction walkthrough, stack transitions, failure experiments |
| `#propagation` | Node relay and separate local mempools |
| `#mining` | Candidate selection, sample header hashing, simulated confirmations |

SegWit inputs use compressed SEC public keys. Taproot starts from a compressed
SEC key and explains its x-only interpretation; this example has no script
tree. The comparison lab uses `<key> OP_CHECKSIG` for P2SH and P2WSH, making
their common one-key input explicit rather than silently adding multisig keys.

The transaction lab accepts 1–20 inputs and outputs, integer satoshi amounts,
and mainnet or testnet P2PKH addresses. Previous locks can also be supplied as
standard P2PKH script hex. UTXO existence and unspent status are not checked.
The example outpoint is fictional. Version 2, final sequences, zero locktime,
and initially empty scriptSigs keep the construction focused on transaction structure.
Previous amounts and scripts are metadata, not serialized input fields. Fees
use supplied amounts; unsigned byte size is not a signed fee-rate estimate.

The signing action uses `PrivateKey.sign_input` with `SIGHASH_ALL` for each input.
Each 32-byte hex key and selected SEC format must match its supplied previous
locking script. The public example uses scalar 1; use disposable learning keys,
never funded wallet keys. Keys are kept in memory and appear in the displayed
and copied Python. Both compressed and uncompressed public keys are supported.
The result explains each digest, signature, sighash byte, and scriptSig, then
compares unsigned and signed sizes and transaction IDs. Tests independently
construct legacy SIGHASH_ALL digests and verify the signatures with ECDSA.

Script execution uses `bitcoinutils.learning.trace_p2pkh_input` from version
0.8.6 inside the browser worker. Select an input and step through or play its
scriptSig and scriptPubKey, with before/after stacks and the CHECKSIG digest.
Experiments change a public key, signature byte, or output on a separate copy.
The evaluator supports standard legacy P2PKH with SIGHASH_ALL; it does not
provide full node validation, on-chain UTXO checks, or broadcasting.

Six separate transaction menu items share the in-memory draft and signed
transaction, including when navigating to address lessons and back. Next-step
links connect Anatomy → Signing → Script execution → Propagation → Mining → Block propagation.
Directly opening a later
stage offers a signed public example; reload starts a fresh session.

In Propagation, play or step through modeled announcements,
requests, receipts, and admission. Select any of five nodes to inspect its own
mempool; change C's illustrative fee threshold, remove a referenced output at
C, or disconnect E. Added fee competition affects only the selected snapshot.
The scene uses the actual signed TXID and bytes, assumed starting UTXOs, and
explicitly modeled validation. No real network broadcast takes place, and the
transaction stays unconfirmed there. Mining adds selection among independent
entries, real `BlockHeader` hashing with an easy demonstration target, and
separately simulated per-node block acceptance and confirmation depth. The hash
exercise uses a supplied root, not a calculated commitment to the candidate.
See [LIBRARY_GAPS.md](LIBRARY_GAPS.md) for the remaining validation and mining APIs.

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
- `public/python/lesson_adapter.py` composes existing library APIs. The exact
  Python snippets it executes are sent to the code panel.
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
is conceptual; the application does not execute scripts or sign transactions.
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
| bitcoin-utils | 0.8.6 |
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

Mining, live nodes, wallets, and an editable Python console are outside this
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
