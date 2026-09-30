/** Price the already signed reference sizes without binary-decimal rounding errors. */
export function comparisonFee(vsize: number, rate: string): number | null {
  if (!/^\d{1,4}(\.\d{1,4})?$/.test(rate) || Number(rate) < 0.01 || Number(rate) > 1000) return null;
  const scale = 10 ** (rate.split('.')[1]?.length ?? 0);
  return Math.ceil(vsize * Number(rate.replace('.', '')) / scale);
}
