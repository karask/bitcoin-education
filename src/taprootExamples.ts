import type { Network, TaprootPath, TransactionDraft } from './types';

export const TAPROOT_ADDRESSES = {
  "mainnet": {
    "key": [
      "bc1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5sspknck9",
      "bc1pet7ep3czdu9k4wvdlz2fp5p8x2yp7t6ttyqg2c6cmh0lgeuu9lasmp9hsg"
    ],
    "tree": {
      "2": "bc1pwa73xt4xflw30274g77enns3dl99wz0xjexzp8zpde8zsuz44cvstu6jz4",
      "3": "bc1pq9zmu4xd795ukg2x74lnrcqdws6yy47r2ts0qg7cs3xkktar90psss9dy8"
    }
  },
  "testnet": {
    "key": [
      "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
      "tb1pet7ep3czdu9k4wvdlz2fp5p8x2yp7t6ttyqg2c6cmh0lgeuu9lasvfnc28"
    ],
    "tree": {
      "2": "tb1pwa73xt4xflw30274g77enns3dl99wz0xjexzp8zpde8zsuz44cvsu5vac6",
      "3": "tb1pq9zmu4xd795ukg2x74lnrcqdws6yy47r2ts0qg7cs3xkktar90ps8cnz7g"
    }
  }
} as const;
export const LEARNING_INTERNAL_KEY = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
export const learningKey = (n: number) => n.toString(16).padStart(64, '0');
export function pathDefaults(path: TaprootPath) { return { taprootPath: path, privateKey: learningKey(path === 'recovery' ? 5 : path === 'hashlock' ? 6 : 1), sequence: path === 'recovery' ? '144' : '4294967295' }; }
export function taprootExample(network: Network, tree: boolean): TransactionDraft {
 const addresses = TAPROOT_ADDRESSES[network];
 const source = tree ? addresses.tree['2'] : addresses.key[0];
 return { spendType: tree ? 'p2tr-script' : 'p2tr', inputs: [{ txid: '0123456789abcdef'.repeat(4), vout: '0', amount: '100000', sourceType: 'address', source, internalKey: LEARNING_INTERNAL_KEY, ...pathDefaults(tree ? 'multisig' : 'key'), taprootLeaves: 2, signerKeys: [learningKey(2), learningKey(3), ''], secret: '62697420627920626974' }], outputs: [{ address: addresses.key[1], amount: '60000' }, { address: source, amount: '39000' }] };
}
