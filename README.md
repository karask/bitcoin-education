# Bit by Bit

A local, browser-native Bitcoin learning lab. P2PKH and P2SH lessons explain
address construction with real Python, synchronized pseudocode, and annotated
bytes. Both light and dark themes are included.

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

## Pinned local runtime

| Component | Version |
| --- | --- |
| Pyodide | 314.0.7 |
| bitcoin-utils | 0.8.5 |
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
