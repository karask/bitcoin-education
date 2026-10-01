import type { Network, TransactionDraft } from './types';
import type { FundingQuote, WalletCoin, WalletSpend } from './coinSelection';

// Derived with the pinned python-bitcoin-utils runtime from public learning scalars 1–5.
export const WALLET_ADDRESSES = {
  "mainnet": {
    "p2pkh": {
      "1": "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
      "2": "1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP",
      "3": "1CUNEBjYrCn2y1SdiUMohaKUi4wpP326Lb",
      "4": "1JtK9CQw1syfWj1WtFMWomrYdV3W2tWBF9",
      "5": "17Vu7st1U1KwymUKU4jJheHHGRVNqrcfLD"
    },
    "p2wpkh": {
      "1": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      "2": "bc1qq6hag67dl53wl99vzg42z8eyzfz2xlkvxechjp",
      "3": "bc1q0ht9tyks4vh7p5p904t340cr9nvahy7u3re7zg",
      "4": "bc1qcsh8a7f0mdsr47zy6pj04tv4mwdumlfaslcy8n",
      "5": "bc1qgar7sarvmkenkrmljk5slz0cn7ec0jakk4qa7y"
    },
    "nested": {
      "1": "3JvL6Ymt8MVWiCNHC7oWU6nLeHNJKLZGLN",
      "2": "3FWHHE3RVgyv5vYmMrcoRdA25uugWvQbso",
      "3": "3BM3eLQZbwubG3XwwxJmd9qxwMJn7yUTSn",
      "4": "36mwXuH4FVaeLuMUsmyU7YvVXKCcuZyP5N",
      "5": "36UVqWe99RXE1aT6K7hVJ6jHqkw2iRCA4h"
    },
    "p2tr": {
      "1": "bc1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5sspknck9",
      "2": "bc1pet7ep3czdu9k4wvdlz2fp5p8x2yp7t6ttyqg2c6cmh0lgeuu9lasmp9hsg",
      "3": "bc1pgxxyvcmdncdxs06cudd5yvmwwahaesaj6n3eu7st7x4sw9hrchaqjy33gs",
      "4": "bc1pjvtc2mkj9vmfneuj7w9dsqle70a040ms5tyfswhhz4vjyskznj5ql45vlj",
      "5": "bc1paecncecu260mkwvsr63lw5v4s496v9gfn2en56hv4f0d2w2j97fsmfm28s"
    }
  },
  "testnet": {
    "p2pkh": {
      "1": "mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r",
      "2": "mg8Jz5776UdyiYcBb9Z873NTozEiADRW5H",
      "3": "mrzKXEpXfEDHk7vFS3LBXVXoa4YXFcCkje",
      "4": "myQGSFVupuQvHqV8bpKtdh4sVUeCyyxs6M",
      "5": "mn1rQvxzH2mCkswwBdhgXZVc8R65pjduqE"
    },
    "p2wpkh": {
      "1": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      "2": "tb1qq6hag67dl53wl99vzg42z8eyzfz2xlkvvlryfj",
      "3": "tb1q0ht9tyks4vh7p5p904t340cr9nvahy7um9zdem",
      "4": "tb1qcsh8a7f0mdsr47zy6pj04tv4mwdumlfa6erhuq",
      "5": "tb1qgar7sarvmkenkrmljk5slz0cn7ec0jakunmw9h"
    },
    "nested": {
      "1": "2NAUYAHhujozruyzpsFRP63mbrdaU5wnEpN",
      "2": "2N74VLxyT79VGHiBK2zEg3a9HJG7rEc5F3o",
      "3": "2N2uFi5LbDQQwTqAVd5veF6qE9hWww2DVzF",
      "4": "2MxL9beD5rx5zYgz2YubLjVukjfQnkPruFK",
      "5": "2Mx2huFaAkt2aDN5dzFKMv3iZ479CZHAqzG"
    },
    "p2tr": {
      "1": "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
      "2": "tb1pet7ep3czdu9k4wvdlz2fp5p8x2yp7t6ttyqg2c6cmh0lgeuu9lasvfnc28",
      "3": "tb1pgxxyvcmdncdxs06cudd5yvmwwahaesaj6n3eu7st7x4sw9hrchaq9v87jl",
      "4": "tb1pjvtc2mkj9vmfneuj7w9dsqle70a040ms5tyfswhhz4vjyskznj5qgazr9a",
      "5": "tb1paecncecu260mkwvsr63lw5v4s496v9gfn2en56hv4f0d2w2j97fsvpd9al"
    }
  }
} as const;
const REDEEM_PROGRAMS: Record<string, string> = {
  "1": "0014751e76e8199196d454941c45d1b3a323f1433bd6",
  "3": "00147dd65592d0ab2fe0d0257d571abf032cd9db93dc",
  "4": "0014c42e7ef92fdb603af844d064faad95db9bcdfd3d"
};
const INTERNAL_KEYS: Record<string, string> = {
  "1": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "3": "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  "4": "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13"
};

export const WALLET_COINS: readonly WalletCoin[] = [
  { id: 'coin-a', label: 'Work payment', amount: 90000, key: 1, txid: '11'.repeat(32), vout: 0 },
  { id: 'coin-b', label: 'Work payment', amount: 42000, key: 1, txid: '22'.repeat(32), vout: 1 },
  { id: 'coin-c', label: 'Gift', amount: 27000, key: 3, txid: '33'.repeat(32), vout: 0 },
  { id: 'coin-d', label: 'Savings', amount: 18000, key: 4, txid: '44'.repeat(32), vout: 2 },
  { id: 'coin-e', label: 'Savings', amount: 10500, key: 4, txid: '55'.repeat(32), vout: 0 },
  { id: 'coin-f', label: 'Gift', amount: 7000, key: 3, txid: '66'.repeat(32), vout: 1 },
  { id: 'coin-g', label: 'Work payment', amount: 1200, key: 1, txid: '77'.repeat(32), vout: 0 },
  { id: 'coin-h', label: 'Gift', amount: 350, key: 3, txid: '88'.repeat(32), vout: 0 },
];

export function fundingDraft(coins: readonly WalletCoin[], quote: FundingQuote, type: WalletSpend, network: Network): TransactionDraft {
  if (!quote.funded || coins.length === 0) throw new Error('Choose a funded selection before opening Anatomy.');
  const addresses = WALLET_ADDRESSES[network][type];
  return { spendType: type, inputs: coins.map(coin => ({
    txid: coin.txid, vout: String(coin.vout), amount: String(coin.amount),
    sourceType: 'address', source: addresses[String(coin.key) as '1' | '3' | '4'],
    privateKey: coin.key.toString(16).padStart(64, '0'), compressed: true,
    ...(type === 'nested' ? { redeemScript: REDEEM_PROGRAMS[String(coin.key)] } : {}),
    ...(type === 'p2tr' ? { internalKey: INTERNAL_KEYS[String(coin.key)], taprootPath: 'key' as const, sequence: '4294967295' } : {}),
  })), outputs: [{ address: addresses['2'], amount: String(quote.payment) },
    ...(quote.hasChange ? [{ address: addresses['5'], amount: String(quote.change) }] : [])] };
}
