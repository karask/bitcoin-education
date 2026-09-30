# Third-party notices

This project uses the following open-source components. Original license texts
remain in their npm packages or Python wheel distributions.

- [python-bitcoin-utils](https://github.com/karask/python-bitcoin-utils): MIT.
- [Pyodide](https://github.com/pyodide/pyodide): Mozilla Public License 2.0;
  includes CPython and its dependencies under their respective licenses.
- [React](https://github.com/facebook/react), [Vite](https://github.com/vitejs/vite): MIT.
- [TypeScript](https://github.com/microsoft/TypeScript): Apache License 2.0.
- [Lucide](https://github.com/lucide-icons/lucide): ISC, with portions derived from Feather under MIT.
- DM Sans and JetBrains Mono: SIL Open Font License 1.1; bundled through Fontsource.
- base58check: MIT; ecdsa: MIT; SymPy: BSD; six: MIT; mpmath: BSD.

Fonts are bundled locally; no requests are sent to a font provider.

The BIP341 wallet test fixture in `tests/fixtures/bip341-wallet-test-vectors.json`
is reproduced from the Bitcoin BIPs repository's `bip-0341/wallet-test-vectors.json`.
BIP341 is licensed under the 3-clause BSD license, as stated in the specification:
<https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki>.
