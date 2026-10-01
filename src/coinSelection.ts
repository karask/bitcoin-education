import { comparisonFee } from './comparisonMath';

export type WalletSpend = 'p2pkh' | 'p2wpkh' | 'nested' | 'p2tr';
export type SelectionStrategy = 'fewest' | 'change' | 'consolidate';
export interface WalletCoin { id: string; label: string; amount: number; key: 1 | 3 | 4; txid: string; vout: number }
export interface FundingQuote {
  payment: number; total: number; count: number; funded: boolean; shortfall: number;
  vsize: number; minimumFee: number; fee: number; change: number; hasChange: boolean;
  extraFee: number; dust: number; addresses: number; uneconomic: number; reason: string;
}
// Low-S ECDSA budget: at most 71 DER bytes plus its SIGHASH byte. Taproot uses DEFAULT.
export const SPEND_BUDGETS = {
  p2pkh: { label: 'Legacy P2PKH', baseInput: 148, witness: 0, output: 34, dust: 546 },
  p2wpkh: { label: 'Native P2WPKH', baseInput: 41, witness: 108, output: 31, dust: 294 },
  nested: { label: 'Nested SegWit', baseInput: 64, witness: 108, output: 32, dust: 540 },
  p2tr: { label: 'Taproot payment', baseInput: 41, witness: 66, output: 43, dust: 330 },
} as const;

export function estimatedVsize(type: WalletSpend, inputs: number, outputs: 1 | 2): number {
  if (!Number.isInteger(inputs) || inputs < 1 || inputs > 20) throw new Error('Use 1–20 inputs.');
  const size = SPEND_BUDGETS[type];
  // Counts fit in one CompactSize byte. SegWit marker + flag contribute two weight units.
  return Math.ceil(((10 + inputs * size.baseInput + outputs * size.output) * 4 + (size.witness ? 2 + inputs * size.witness : 0)) / 4);
}
export function inputVsize(type: WalletSpend): number {
  const size = SPEND_BUDGETS[type];
  return size.baseInput + size.witness / 4;
}
export function parsePayment(value: string): number | null {
  if (!/^\d{1,7}$/.test(value)) return null;
  const amount = Number(value);
  return amount >= 1 && amount <= 1000000 ? amount : null;
}
export function quoteSelection(coins: readonly WalletCoin[], payment: number, rate: string, type: WalletSpend): FundingQuote {
  if (!Number.isSafeInteger(payment) || payment < 1 || comparisonFee(1, rate) === null) throw new Error('Use a valid payment and fee rate.');
  if (coins.length > 20 || new Set(coins.map(coin => `${coin.txid}:${coin.vout}`)).size !== coins.length || coins.some(coin => !Number.isSafeInteger(coin.amount) || coin.amount <= 0)) throw new Error('Use distinct positive-value UTXOs.');
  const total = coins.reduce((sum, coin) => sum + coin.amount, 0);
  if (!Number.isSafeInteger(total)) throw new Error('The selected total exceeds safe integer arithmetic.');
  const dust = SPEND_BUDGETS[type].dust;
  const base = { payment, total, count: coins.length, dust, addresses: new Set(coins.map(coin => coin.key)).size,
    uneconomic: coins.filter(coin => coin.amount <= comparisonFee(inputVsize(type), rate)!).length };
  const empty = { ...base, funded: false, shortfall: payment, vsize: 0, minimumFee: 0, fee: 0, change: 0, hasChange: false, extraFee: 0, reason: 'Select a coin to start.' };
  if (!coins.length) return empty;
  const oneSize = estimatedVsize(type, coins.length, 1), oneFee = comparisonFee(oneSize, rate)!;
  if (payment < dust) return { ...empty, vsize: oneSize, minimumFee: oneFee, shortfall: 0, reason: `Payment is below this lab’s ${dust}-sat dust threshold.` };
  if (total < payment + oneFee) return { ...empty, vsize: oneSize, minimumFee: oneFee, shortfall: payment + oneFee - total, reason: 'Selected coins do not cover the payment and estimated fee.' };
  const twoSize = estimatedVsize(type, coins.length, 2), twoFee = comparisonFee(twoSize, rate)!;
  const change = total - payment - twoFee;
  if (change >= dust) return { ...base, funded: true, shortfall: 0, vsize: twoSize, minimumFee: twoFee, fee: twoFee, change, hasChange: true, extraFee: 0, reason: 'Payment plus a change output back to the wallet.' };
  const fee = total - payment;
  return { ...base, funded: true, shortfall: 0, vsize: oneSize, minimumFee: oneFee, fee, change: 0, hasChange: false, extraFee: fee - oneFee,
    reason: change < 0 ? 'There is enough for one output, but not enough to add change. The remainder becomes fee.' : 'The potential change is below the dust threshold. The remainder becomes fee.' };
}

export function selectCoins(wallet: readonly WalletCoin[], payment: number, rate: string, type: WalletSpend, strategy: SelectionStrategy): WalletCoin[] {
  if (wallet.length > 12) throw new Error('The teaching search is limited to 12 coins.');
  quoteSelection(wallet, payment, rate, type);
  if (strategy === 'consolidate') {
    return wallet.filter(coin => coin.amount > comparisonFee(inputVsize(type), rate)!);
  }
  let best: { coins: WalletCoin[]; rank: number[] } | null = null;
  // Exhaustive small-wallet search makes the trade-offs visible; this is not Bitcoin Core's algorithm.
  for (let mask = 1; mask < 2 ** wallet.length; mask++) {
    const coins = wallet.filter((_, index) => mask & (1 << index));
    const quote = quoteSelection(coins, payment, rate, type);
    if (!quote.funded) continue;
    const rank = strategy === 'fewest' ? [coins.length, quote.fee, quote.change, mask] : [quote.change, quote.fee, coins.length, mask];
    const difference = best ? rank.findIndex((value, index) => value !== best!.rank[index]) : -1;
    if (!best || (difference >= 0 && rank[difference] < best.rank[difference])) best = { coins, rank };
  }
  return best?.coins ?? [];
}
