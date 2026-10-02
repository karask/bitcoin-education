// Small, public teaching values only. Actual secp256k1 operations run in Python.
export type ToyPoint = { x: number; y: number } | null;
export const TOY = { p: 17, a: 2, b: 2, n: 19, G: { x: 5, y: 1 } } as const;
export const SECP_P = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
export const SECP_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
export const mod = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus;
export function inverse(value: number, modulus: number): number | null {
  for (let candidate = 1; candidate < modulus; candidate++) if (mod(value * candidate, modulus) === 1) return candidate;
  return null;
}
export const pointLabel = (point: ToyPoint) => point ? `(${point.x}, ${point.y})` : '𝒪';
export const samePoint = (a: ToyPoint, b: ToyPoint) => a === null || b === null ? a === b : a.x === b.x && a.y === b.y;
export function toyPoints(): ToyPoint[] {
  const points: ToyPoint[] = [];
  for (let x = 0; x < TOY.p; x++) for (let y = 0; y < TOY.p; y++) {
    if (mod(y * y - x ** 3 - TOY.a * x - TOY.b, TOY.p) === 0) points.push({ x, y });
  }
  return points;
}
export function addPoints(P: ToyPoint, Q: ToyPoint): ToyPoint {
  if (!P) return Q;
  if (!Q) return P;
  if (P.x === Q.x && mod(P.y + Q.y, TOY.p) === 0) return null;
  const doubling = samePoint(P, Q);
  const numerator = doubling ? 3 * P.x ** 2 + TOY.a : Q.y - P.y;
  const denominator = doubling ? 2 * P.y : Q.x - P.x;
  const inv = inverse(denominator, TOY.p);
  if (inv === null) throw new Error('This curve operation has no finite slope.');
  const slope = mod(numerator * inv, TOY.p);
  const x = mod(slope ** 2 - P.x - Q.x, TOY.p);
  return { x, y: mod(slope * (P.x - x) - P.y, TOY.p) };
}
export function multiplyPoint(scalar: number, point: ToyPoint = TOY.G): ToyPoint {
  let result: ToyPoint = null;
  let power = point;
  let remaining = mod(scalar, TOY.n);
  while (remaining > 0) {
    if (remaining % 2) result = addPoints(result, power);
    power = addPoints(power, power);
    remaining = Math.floor(remaining / 2);
  }
  return result;
}
export function doubleAndAdd(scalar: number) {
  let result: ToyPoint = null;
  return scalar.toString(2).split('').map((bit, index) => {
    const before = result;
    const doubled = addPoints(result, result);
    result = bit === '1' ? addPoints(doubled, TOY.G) : doubled;
    return { index, bit, before, doubled, result };
  });
}
export function toySign(d: number, z: number, k: number) {
  const R = multiplyPoint(k);
  const kInverse = inverse(k, TOY.n);
  const r = R ? mod(R.x, TOY.n) : 0;
  const s = kInverse === null ? 0 : mod(kInverse * (z + r * d), TOY.n);
  return { R, r, s, kInverse, valid: r !== 0 && s !== 0 && kInverse !== null };
}
export function toyVerify(Q: ToyPoint, z: number, r: number, s: number) {
  if (!Q || r < 1 || r >= TOY.n || s < 1 || s >= TOY.n) return { valid: false, w: null, u1: 0, u2: 0, V: null };
  const w = inverse(s, TOY.n)!;
  const u1 = mod(z * w, TOY.n), u2 = mod(r * w, TOY.n);
  const V = addPoints(multiplyPoint(u1), multiplyPoint(u2, Q));
  return { w, u1, u2, V, valid: V !== null && mod(V.x, TOY.n) === r };
}
