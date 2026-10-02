import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Copy, KeyRound, Pause, Play, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CryptographyPage, CryptographyResult, LessonInput } from './types';
import type { usePython } from './usePython';
import { CATALOG, CRYPTOGRAPHY_ORDER } from './lessonCatalog';
import { TOY, SECP_N, SECP_P, mod, inverse, pointLabel, samePoint, toyPoints, addPoints, multiplyPoint, doubleAndAdd, toySign, toyVerify } from './cryptographyMath';
import type { ToyPoint } from './cryptographyMath';
import './cryptography.css';

const INITIAL_MESSAGE = 'Bitcoin makes more sense one step at a time.';
const hex32 = (value: number) => value.toString(16).padStart(64, '0');
const POINTS = toyPoints();
const FOUNDATIONS = ['Finite sets', 'Numbers & bytes', 'Modular arithmetic', 'Prime fields', 'Groups', 'Elliptic curves'];
const TERMS: Record<string, string> = {
  'finite set': 'A collection with a finite number of distinct elements. |S| means the number of elements in S; x ∈ S means x belongs to S.',
  scalar: 'An integer used to multiply a group point through repeated addition. A private key is a scalar; a public key is a point.',
  'modular arithmetic': 'Arithmetic that keeps the remainder after division by a modulus. a ≡ b (mod m) means a and b have the same remainder.',
  'finite field': 'A finite set with addition, subtraction, multiplication, and division by every nonzero element. Fₚ uses residues 0 through p−1 for a prime p.',
  inverse: 'A multiplicative inverse a⁻¹ satisfies a × a⁻¹ ≡ 1. Division by a means multiplying by a⁻¹, using the same modulus.',
  group: 'A set with an operation that is closed and associative, has an identity, and gives every element an inverse. Elliptic-curve groups also commute.',
  identity: 'The element that leaves another unchanged. For curve addition this is the point at infinity 𝒪: P + 𝒪 = P.',
  generator: 'A point G whose repeated additions generate a cyclic subgroup. For both curves in this lesson, G generates the entire curve group.',
  order: 'The order n of G is the smallest positive integer with nG = 𝒪. This is different from the field prime p used for coordinates.',
};

function Formula({ children }: { children: ReactNode }) { return <div className="crypto-formula">{children}</div>; }
function Card({ number, title, children, className = '' }: { number?: string; title: string; children: ReactNode; className?: string }) {
  return <section className={`panel crypto-card ${className}`}><div className="crypto-card-heading">{number && <span className="section-index">{number}</span>}<h2>{title}</h2></div>{children}</section>;
}
function Recall({ terms, children }: { terms: string[]; children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return <div className="crypto-recall"><BookOpen size={19} /><div><strong>Building on what you learned</strong><p>{children}</p><div className="crypto-terms">{terms.map(term => <button key={term} onClick={() => setOpen(open === term ? null : term)} aria-expanded={open === term}>{term}</button>)}</div>{open && <p className="crypto-term-definition">{TERMS[open]}</p>}</div></div>;
}
function CopyCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => { setCopied(false); setFailed(false); }, [value]);
  return <button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setFailed(true); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : failed ? 'Select text to copy' : 'Copy Python'}</button>;
}
function Value({ label, value }: { label: string; value: string }) { return <div className="crypto-value"><span>{label}</span><code>{value}</code></div>; }
function Playback({ current, count, select, label }: { current: number; count: number; select: (value: number) => void; label: string }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setPlaying(false); }, [count]);
  useEffect(() => {
    if (!playing) return;
    if (current >= count - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => select(current + 1), 1600);
    return () => clearTimeout(timer);
  }, [playing, current, count, select]);
  return <div className="crypto-playback" role="group" aria-label={label}>
    <button className="secondary-button" onClick={() => { if (current === count - 1) select(0); setPlaying(!playing); }}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : 'Play'}</button>
    <button className="icon-button" aria-label={`Restart ${label}`} onClick={() => { setPlaying(false); select(0); }}><RotateCcw size={16} /></button>
    <span aria-live="polite">Step {current + 1} of {count}</span>
    <button className="icon-button" aria-label={`Previous ${label} step`} disabled={current === 0} onClick={() => { setPlaying(false); select(current - 1); }}><ArrowLeft size={16} /></button>
    <button className="icon-button" aria-label={`Next ${label} step`} disabled={current === count - 1} onClick={() => { setPlaying(false); select(current + 1); }}><ArrowRight size={16} /></button>
  </div>;
}

function CurvePlot({ P = null, Q = null, result = null, onSelect }: { P?: ToyPoint; Q?: ToyPoint; result?: ToyPoint; onSelect?: (point: ToyPoint) => void }) {
  const position = (point: { x: number; y: number }) => ({ x: 32 + point.x * 19, y: 338 - point.y * 19 });
  return <div className="crypto-plot-wrap"><svg viewBox="0 0 370 375" className="crypto-plot" role="img" aria-label="Discrete points satisfying y squared equals x cubed plus 2x plus 2 modulo 17. Highlighted points are listed below.">
    {Array.from({ length: 17 }, (_, i) => <g key={i}><line x1="32" x2="336" y1={338 - i * 19} y2={338 - i * 19} className="crypto-grid-line" /><line y1="34" y2="338" x1={32 + i * 19} x2={32 + i * 19} className="crypto-grid-line" />{i % 4 === 0 && <><text x={32 + i * 19} y="355" textAnchor="middle">{i}</text><text x="21" y={342 - i * 19} textAnchor="end">{i}</text></>}</g>)}
    <text x="347" y="355">x</text><text x="17" y="24">y</text>
    {POINTS.map(point => { if (!point) return null; const pos = position(point); const active = samePoint(point, result) ? 'sum' : samePoint(point, P) ? 'first' : samePoint(point, Q) ? 'second' : ''; return <circle key={pointLabel(point)} cx={pos.x} cy={pos.y} r={active ? 7 : 4} className={`crypto-curve-point ${active}`}><title>{pointLabel(point)}{active ? ` · ${active === 'sum' ? 'result' : active === 'first' ? 'P' : 'Q'}` : ''}</title></circle>; })}
  </svg><div className="crypto-plot-legend">{P && <span className="first">P: {pointLabel(P)}</span>}{Q && <span className="second">Q: {pointLabel(Q)}</span>}<span className="sum">Result: {pointLabel(result)}</span></div><div className="crypto-plot-caption">18 finite points + 𝒪 = 19 group elements. Only these dots satisfy the equation.</div>{onSelect && <label className="crypto-control">Select a curve point (plot coordinates)<select value={pointLabel(P ?? null)} onChange={event => onSelect(POINTS.find(point => pointLabel(point) === event.target.value) ?? null)}><option value="𝒪">𝒪 · point at infinity</option>{POINTS.map(point => <option key={pointLabel(point)} value={pointLabel(point)}>{pointLabel(point)}</option>)}</select></label>}</div>;
}

function SetExplorer() {
  const [size, setSize] = useState(7), [selected, setSelected] = useState(3);
  const member = selected < size;
  return <>
    <p>A <strong>set</strong> is a collection of distinct elements; duplicates do not count twice. A finite set has a countable, finite size. Braces list its elements, ∈ means “belongs to,” and |S| means its size, called its cardinality.</p>
    <Formula>S = {'{'}0, 1, …, {size - 1}{'}'} &nbsp; · &nbsp; |S| = {size}</Formula>
    <label className="crypto-control">Number of elements: {size}<input type="range" min="2" max="12" value={size} onChange={event => setSize(+event.target.value)} /></label>
    <div className="crypto-set" aria-label="Finite set elements">{Array.from({ length: 12 }, (_, i) => <button className={`${i < size ? 'member' : ''} ${selected === i ? 'chosen' : ''}`} key={i} onClick={() => setSelected(i)} aria-pressed={selected === i}>{i}</button>)}</div>
    <p aria-live="polite"><strong>{selected} {member ? '∈' : '∉'} S.</strong> {member ? 'This number belongs to the set.' : 'This number is outside the set.'} The faded choices are outside S.</p>
    <p>Later, our coordinate field will contain 17 numbers, our curve group will contain 19 points, and our private-key set will contain 18 allowed scalars. These are three distinct finite sets.</p>
  </>;
}
function NumberExplorer() {
  const [value, setValue] = useState(7);
  return <>
    <p>An integer is a whole number. A power such as 2⁸ means eight factors of 2 multiplied together. A bit has two possible values, 0 or 1; a byte has eight bits, giving 2⁸ = 256 possible values, from 0 to 255.</p>
    <label className="crypto-control">One byte, as an integer: {value}<input type="range" min="0" max="255" value={value} onChange={event => setValue(+event.target.value)} /></label>
    <div className="crypto-bits">{value.toString(2).padStart(8, '0').split('').map((bit, i) => <div key={i} className={bit === '1' ? 'on' : ''}><strong>{bit}</strong><small>2^{7 - i}</small></div>)}</div>
    <Formula>{value} (decimal) = {value.toString(2).padStart(8, '0')} (binary) = {value.toString(16).padStart(2, '0')} (hex)</Formula>
    <p>Binary is base 2: each position has weight 1, 2, 4, 8, … from right to left. Hexadecimal is base 16, using 0–9 and a–f; one hex digit represents four bits, so two hex digits represent a byte.</p>
    <p>A 32-byte integer has 256 bits and 64 hex digits. The finite set of all such bit patterns has size 2²⁵⁶. Adding leading zeros changes the written length, not the integer’s value. A private key will use a subset of these patterns.</p>
  </>;
}
function ModularExplorer() {
  const [value, setValue] = useState(20);
  const remainder = mod(value, 17), turns = Math.floor(value / 17);
  const xy = (i: number, radius: number) => ({ x: 150 + Math.sin(i * Math.PI * 2 / 17) * radius, y: 150 - Math.cos(i * Math.PI * 2 / 17) * radius });
  const pointer = xy(remainder, 98);
  return <div className="crypto-two-col"><div>
    <p>The modulo operation keeps the remainder after integer division. With modulus 17, the result always belongs to the finite set {'{'}0, …, 16{'}'}. Congruence, written ≡, says that two integers have the same remainder.</p>
    <label className="crypto-control">Integer a: {value}<input type="range" min="-34" max="68" value={value} onChange={event => setValue(+event.target.value)} /></label>
    <Formula>{value} = 17 × ({turns}) + {remainder}<br />{value} ≡ {remainder} (mod 17)</Formula>
    <p>After 16 comes 0. Negative values wrap too: −1 ≡ 16 (mod 17). We always use the representative between 0 and 16.</p>
    <p>“Closed” means an operation stays inside its set. Reduce after addition or multiplication and the answer stays among these 17 residues: 15 + 5 ≡ 3; 5 × 4 ≡ 3.</p>
  </div><div><svg viewBox="0 0 300 300" className="crypto-clock" role="img" aria-label={`Modulo 17 clock: ${value} has remainder ${remainder}`}><circle cx="150" cy="150" r="98" className="crypto-clock-ring" /><line x1="150" y1="150" x2={pointer.x} y2={pointer.y} className="crypto-clock-hand" />{Array.from({ length: 17 }, (_, i) => { const pos = xy(i, 124); return <text key={i} x={pos.x} y={pos.y + 5} textAnchor="middle" className={i === remainder ? 'active' : ''}>{i}</text>; })}<circle cx="150" cy="150" r="29" className="crypto-clock-center" /><text x="150" y="156" textAnchor="middle" className="active">{remainder}</text></svg><p className="crypto-caption">17 residues. Every turn returns to the same element.</p></div></div>;
}
function FieldExplorer() {
  const [modulus, setModulus] = useState(17), [a, setA] = useState(5);
  const inv = inverse(a, modulus);
  return <>
    <p>A <strong>prime</strong> integer is greater than 1 and has only 1 and itself as positive divisors. A finite field adds usable arithmetic to a finite set. For a prime p, Fₚ = {'{'}0, …, p−1{'}'} supports addition, subtraction, multiplication, and division by every nonzero element, all modulo p.</p>
    <p>Division needs a <strong>multiplicative inverse</strong>: a⁻¹ is the element that multiplies a to give 1. It is not the ordinary fraction 1/a. Zero has no multiplicative inverse.</p>
    <div className="crypto-inline-controls"><label className="crypto-control">Modulus<select value={modulus} onChange={event => { setModulus(+event.target.value); setA(5); }}><option value="17">17 · prime (a field)</option><option value="18">18 · composite (compare)</option></select></label><label className="crypto-control">Element a: {a}<input type="range" min="0" max={modulus - 1} value={a} onChange={event => setA(+event.target.value)} /></label></div>
    <div className="crypto-products">{Array.from({ length: modulus }, (_, b) => <div key={b} className={mod(a * b, modulus) === 1 ? 'found' : ''}><small>{a} × {b}</small><strong>{mod(a * b, modulus)}</strong></div>)}</div>
    <Formula>{inv === null ? `${a} has no multiplicative inverse modulo ${modulus}` : `${a} × ${inv} ≡ 1 (mod ${modulus}), so ${a}⁻¹ = ${inv}`}</Formula>
    <p>{modulus === 17 ? 'Every nonzero choice has exactly one inverse. That is why modular division works in F₁₇.' : 'For example, 6 has no inverse modulo 18. A composite modulus does not give this residue set a field structure.'}</p>
    <p>Example in F₁₇: 3 ÷ 5 means 3 × 7 ≡ 4, since 5 × 7 ≡ 1. Later, the “division” in point-addition formulas will use this operation. Signature equations will use inverses modulo a different prime, n.</p>
  </>;
}
function GroupExplorer() {
  const [count, setCount] = useState(7);
  const P = multiplyPoint(count);
  return <div className="crypto-two-col"><div>
    <p>A <strong>group</strong> is a set together with an operation. Its operation is closed, is associative (regrouping does not change the result), has an identity, and gives each element an inverse.</p>
    <p>For a familiar example, addition modulo 17 forms a group: 0 is the identity, and a’s additive inverse is −a mod 17. An additive inverse gives 0; a multiplicative inverse gives 1. These are different operations.</p>
    <p>Our next group consists of elliptic-curve points. Its operation is point addition; its identity is a special point called the <strong>point at infinity</strong>, written 𝒪. It is not a dot at coordinate (0, 0). Point addition also commutes: P + Q = Q + P. A group with this extra property is called abelian.</p>
    <Formula>P + 𝒪 = P &nbsp; · &nbsp; P + (−P) = 𝒪</Formula>
    <p>An integer used as a repeated-addition count is called a <strong>scalar</strong>. A <strong>generator</strong> G produces a cyclic subgroup by repeated addition: 𝒪, G, 2G, 3G, … . The <strong>order</strong> n of G is the first positive count that returns to 𝒪. Here G = (5, 1) and n = 19.</p>
    <label className="crypto-control">Add G this many times: {count}<input type="range" min="0" max="38" value={count} onChange={event => setCount(+event.target.value)} /></label>
    <Formula>{count}G = {pointLabel(P)} &nbsp; · &nbsp; {count} ≡ {mod(count, 19)} (mod 19)</Formula>
  </div><div><CurvePlot result={P} /><p className="crypto-caption">At 19G we return to 𝒪. At 20G we are back at G.</p></div></div>;
}
function CurveExplorer() {
  const [P, setP] = useState<ToyPoint>(TOY.G), [Q, setQ] = useState<ToyPoint>(TOY.G);
  const result = addPoints(P, Q);
  const doubling = samePoint(P, Q);
  const special = !P || !Q || (P.x === Q.x && mod(P.y + Q.y, 17) === 0);
  const numerator = P && Q ? doubling ? 3 * P.x ** 2 + 2 : Q.y - P.y : 0;
  const denominator = P && Q ? doubling ? 2 * P.y : Q.x - P.x : 0;
  const inv = inverse(denominator, 17);
  const slope = inv === null ? null : mod(numerator * inv, 17);
  return <>
    <p>A point (x, y) is an ordered pair: x gives its horizontal grid coordinate and y gives its vertical coordinate. An elliptic curve over Fₚ is the finite set of coordinate pairs (x, y) that satisfy y² ≡ x³ + ax + b (mod p), together with 𝒪. The symbols a and b are fixed coefficients; the superscripts mean powers. For an odd prime greater than 3, the condition 4a³ + 27b² ≢ 0 (mod p) rules out singular curves and gives the usual group law.</p>
    <Formula>Teaching curve: y² ≡ x³ + 2x + 2 (mod 17)<br />G = (5, 1) &nbsp; · &nbsp; p = 17 &nbsp; · &nbsp; n = 19</Formula>
    <p>Here 4a³ + 27b² ≡ 4, so the condition holds. Coordinates are field elements modulo <strong>p = 17</strong>. Repeated-addition counts cycle modulo the generator’s order <strong>n = 19</strong>. Keep these two moduli separate.</p>
    <div className="crypto-two-col"><CurvePlot P={P} Q={Q} result={result} onSelect={setP} /><div>
      <label className="crypto-control">Second point Q<select value={pointLabel(Q)} onChange={event => setQ(POINTS.find(point => pointLabel(point) === event.target.value) ?? null)}><option value="𝒪">𝒪 · identity</option>{POINTS.map(point => <option key={pointLabel(point)} value={pointLabel(point)}>{pointLabel(point)}</option>)}</select></label>
      <div className="crypto-inline-controls"><button className="secondary-button" onClick={() => setQ(P)}>Double P</button><button className="secondary-button" onClick={() => setQ(P ? { x: P.x, y: mod(-P.y, 17) } : null)}>Add −P</button></div>
      <Formula>P = {pointLabel(P)}<br />Q = {pointLabel(Q)}<br />P + Q = {pointLabel(result)}</Formula>
      {special ? <p>{!P || !Q ? 'The identity leaves the other point unchanged.' : 'These points are additive inverses: same x, opposite y modulo p. Their sum is 𝒪; no modular division is needed.'}</p> : <>
        <p>λ (lambda) is a field element used in the addition formulas. Every operation below is modulo p = 17. {doubling ? 'When P = Q, use the doubling formula.' : 'For distinct points with different x coordinates, use the addition formula.'}</p>
        <Formula>{doubling ? 'λ = (3x₁² + a) × (2y₁)⁻¹' : 'λ = (y₂ − y₁) × (x₂ − x₁)⁻¹'}<br />λ = {numerator} × {denominator}⁻¹ ≡ {mod(numerator, 17)} × {inv} ≡ {slope}<br />x₃ = λ² − x₁ − x₂<br />y₃ = λ(x₁ − x₃) − y₁</Formula>
        <p>The subscripts 1 and 2 name the input points; 3 names the result. If doubling a point with y = 0 on another curve, its sum with itself is 𝒪. This teaching curve has no such finite point.</p>
      </>}
    </div></div>
    <p>This is a discrete field, so the diagram shows dots without a connecting line. The familiar line-and-tangent picture over real numbers is an intuition for these formulas; here the calculations use modular inverses, not floating-point slopes.</p>
  </>;
}

function PrivateKeys({ d, setD, privateHex }: { d: number; setD: (d: number) => void; privateHex: string }) {
  const [boundary, setBoundary] = useState('1');
  const scalar = /^[0-9]+$/.test(boundary) && boundary.length <= 80 ? BigInt(boundary) : null;
  const valid = scalar !== null && scalar >= 1n && scalar < SECP_N;
  const example = /^[0-9a-fA-F]{64}$/.test(privateHex) ? BigInt(`0x${privateHex}`) : null;
  return <>
    <Recall terms={['finite set', 'scalar', 'generator', 'order', 'identity']}>We ended with G of order n = 19. A private key chooses a nonzero scalar from a finite set associated with that group. Keep d for the private scalar throughout the remaining lessons.</Recall>
    <Card number="01" title="Choose one element from the private-key set">
      <Formula>D = {'{'}1, 2, …, n−1{'}'} &nbsp; · &nbsp; d ∈ D &nbsp; · &nbsp; |D| = n−1</Formula>
      <p>On our teaching curve, D = {'{'}1, …, 18{'}'}. Each allowed scalar generates a different nonidentity point. We exclude 0 and n because 0G = nG = 𝒪. Counts repeat modulo n, so using 20 here would duplicate 1 rather than add another key.</p>
      <div className="crypto-set">{Array.from({ length: 20 }, (_, i) => <button key={i} disabled={i === 0 || i === 19} className={`${i > 0 && i < 19 ? 'member' : ''} ${i === d ? 'chosen' : ''}`} onClick={() => setD(i)} aria-pressed={i === d}>{i}</button>)}</div>
      <p aria-live="polite">Our carried example: <strong>d = {d}</strong>. This selection follows you into public-key construction and ECDSA.</p>
    </Card>
    <Card number="02" title="The same finite-set rule at Bitcoin’s scale">
      <p>secp256k1 uses a generator with prime order n. Private scalars obey the same rule, 1 ≤ d &lt; n. n is the group order, rather than the coordinate prime p.</p>
      <Value label="n · hexadecimal" value={SECP_N.toString(16)} />
      <p>The 32-byte representation has room for 2²⁵⁶ patterns; zero and patterns ≥ n are invalid. A serialized key is a big-endian integer: the most significant byte comes first.</p>
      {example !== null && <><Value label="Selected public learning example · decimal" value={example.toString()} /><Value label="The same integer · 32-byte hexadecimal" value={privateHex} /><Value label="The same integer · binary (leading zero bits omitted)" value={example.toString(2)} /></>}
      <div className="crypto-inline-controls"><label className="crypto-control crypto-grow">Try a scalar boundary · decimal<input value={boundary} onChange={event => setBoundary(event.target.value)} inputMode="numeric" spellCheck={false} /></label><button className="secondary-button" onClick={() => setBoundary('0')}>0</button><button className="secondary-button" onClick={() => setBoundary((SECP_N - 1n).toString())}>n − 1</button><button className="secondary-button" onClick={() => setBoundary(SECP_N.toString())}>n</button></div>
      <p className={`crypto-status ${valid ? 'pass' : 'fail'}`} role="status">{valid ? 'Valid: this scalar belongs to D.' : 'Outside D: use an integer from 1 through n−1.'}</p>
    </Card>
    <Card number="03" title="Set size gives possibility; randomness gives unpredictability">
      <p>Uniform selection makes each element of D equally likely, with probability 1/(n−1). <strong>Entropy</strong> measures uncertainty: a uniform choice from M possibilities has log₂(M) bits of entropy. log₂ is the inverse of taking powers of 2. Our 18-element teaching set offers about 4.17 bits; Bitcoin’s private-key set offers nearly 256 bits.</p>
      <p>Writing a predictable number as 32 bytes does not create entropy. A secure independent key can be sampled as 32 cryptographically random bytes, interpreted as an integer, and retried if it is outside D. Simply reducing a random integer modulo n can introduce bias.</p>
      <p>Wallets may derive keys deterministically from a securely generated seed. Here we use deliberately public examples to inspect the math. The tiny teaching group is searchable; secp256k1’s generic discrete-log security is about 128 bits, despite its nearly 256-bit private-key set.</p>
      <div className="crypto-note">Next: use the selected d = {d} as a count of group additions to construct a public point.</div>
    </Card>
  </>;
}

function PublicKeys({ d }: { d: number }) {
  const [current, setCurrent] = useState(0), [search, setSearch] = useState(0);
  const rows = doubleAndAdd(d), row = rows[Math.min(current, rows.length - 1)], Q = multiplyPoint(d);
  useEffect(() => { setCurrent(0); setSearch(0); }, [d]);
  return <>
    <Recall terms={['scalar', 'group', 'generator', 'order', 'finite field', 'inverse']}>You chose d = {d} from D = {'{'}1, …, 18{'}'}. Now use that scalar to add our same G = (5, 1) to itself. The result Q is a group point, with coordinates in the same field F₁₇.</Recall>
    <Card number="01" title="A public key is a group point">
      <Formula>Q = dG = G + G + … + G &nbsp; (d additions)<br />{d}G = {pointLabel(Q)}</Formula>
      <p>This is scalar multiplication, using the group operation from prerequisites. It does not multiply the x and y coordinates by d. Scalar counts wrap modulo n = 19; the coordinate formulas work modulo p = 17.</p>
      <div className="crypto-multiples">{Array.from({ length: d + 1 }, (_, i) => <div className={i === d ? 'chosen' : ''} key={i}><small>{i === 0 ? 'identity' : `${i}G`}</small><strong>{pointLabel(multiplyPoint(i))}</strong></div>)}</div>
    </Card>
    <Card number="02" title="Use binary to do fewer additions">
      <p>Our numbers lesson introduced binary. Read d’s bits from left to right, starting at 𝒪. For each bit, double the accumulator; if the bit is 1, add G. This follows the recurrence “new count = 2 × old count + bit.”</p>
      <div className="crypto-two-col"><CurvePlot P={row.before} Q={TOY.G} result={row.result} /><div>
        <div className="crypto-bit-buttons" role="group" aria-label="Private scalar binary digits">{rows.map((item, i) => <button className={i === current ? 'chosen' : ''} key={i} onClick={() => setCurrent(i)} aria-pressed={i === current}>{item.bit}<small>bit {i + 1}</small></button>)}</div>
        <Formula>d = {d} = {d.toString(2)}₂<br />Before: {pointLabel(row.before)}<br />Double: {pointLabel(row.doubled)}<br />{row.bit === '1' ? `Add G: ${pointLabel(row.result)}` : `Bit 0: keep ${pointLabel(row.result)}`}</Formula>
        <Playback current={Math.min(current, rows.length - 1)} count={rows.length} select={setCurrent} label="double-and-add" />
        <p>At the last bit the accumulator is Q. A 256-bit scalar needs at most 256 doubling steps and 256 conditional additions in this educational method, rather than d sequential additions.</p>
      </div></div>
      <p>Real cryptographic libraries use hardened implementations and may use faster algorithms. The step trace teaches the group arithmetic; it is not a constant-time implementation for handling secrets.</p>
    </Card>
    <Card number="03" title="Easy forward; hard to reverse at the right scale">
      <p>Recovering d from G and Q is the <strong>elliptic-curve discrete logarithm problem</strong>. The small group lets you try each scalar and compare its point with Q. Click to search one candidate at a time.</p>
      <button className="secondary-button" disabled={search >= d} onClick={() => setSearch(search + 1)}>Try the next scalar <ArrowRight size={15} /></button><button className="text-button" onClick={() => setSearch(0)}>Reset search</button>
      <div className="crypto-multiples" aria-live="polite">{Array.from({ length: search }, (_, i) => <div className={i + 1 === d ? 'chosen' : ''} key={i}><small>d? = {i + 1}</small><strong>{pointLabel(multiplyPoint(i + 1))}</strong><span>{i + 1 === d ? 'Matches Q' : 'Different point'}</span></div>)}</div>
      <p>With only 18 candidates, this example is easy to break. For secp256k1, no efficient classical reverse operation is known; generic attacks take roughly √n ≈ 2¹²⁸ group operations. That distinction explains why we use a large group.</p>
      <div className="crypto-note">Next: keep d and Q, and use the same modular inverse and point multiplication to construct an ECDSA signature.</div>
    </Card>
  </>;
}

function EcdsaLesson({ d }: { d: number }) {
  const [z, setZ] = useState(11), [k, setK] = useState(3), [step, setStep] = useState(0);
  const signature = toySign(d, z, k), Q = multiplyPoint(d), verification = toyVerify(Q, z, signature.r, signature.s);
  const secondZ = mod(z + 1, 19), second = toySign(d, secondZ, k);
  const differenceInverse = inverse(signature.s - second.s, 19);
  const recoveredK = signature.valid && second.valid && differenceInverse !== null ? mod((z - secondZ) * differenceInverse, 19) : null;
  const recoveredD = recoveredK === null ? null : mod((signature.s * recoveredK - z) * inverse(signature.r, 19)!, 19);
  const signSteps = [
    { title: 'Start with a digest integer', formula: `z = ${z}`, text: 'A hash maps message bytes to a fixed-size digest. Here you supply a small digest integer directly, to make the equations readable. The Bitcoin-scale lab below computes SHA-256 of a learning message.' },
    { title: 'Construct the nonce point', formula: `k = ${k}\nR = kG = ${pointLabel(signature.R)}`, text: 'k is a signing nonce: a nonzero scalar modulo n. It is distinct from the private key d. Use the same generator and scalar multiplication used to construct Q.' },
    { title: 'Take the x coordinate as a scalar', formula: `r = x(R) mod n = ${signature.r}`, text: 'x(R) is a coordinate in Fₚ. Interpret its integer representative and reduce modulo n to obtain the signature scalar r. If r is zero, choose a different nonce.' },
    { title: 'Combine the digest and the private scalar', formula: `k⁻¹ = ${signature.kInverse} (mod 19)\ns = k⁻¹(z + rd) mod n\n  = ${signature.kInverse} × (${z} + ${signature.r} × ${d}) mod 19\n  = ${signature.s}`, text: 'This division uses a multiplicative inverse modulo the prime group order n, not the coordinate prime p. If s is zero, choose a different nonce. The signature is the pair (r, s); neither d nor k is sent to the verifier.' },
    { title: 'Verify with public data', formula: signature.valid ? `w = s⁻¹ = ${verification.w}\nu₁ = zw mod n = ${verification.u1}\nu₂ = rw mod n = ${verification.u2}\nV = u₁G + u₂Q = ${pointLabel(verification.V)}\nx(V) mod n = ${verification.V ? mod(verification.V.x, 19) : 'undefined'}; r = ${signature.r}` : 'A zero r or s is not a usable signature.', text: 'First validate Q and check 1 ≤ r,s < n. Then compute V using the public key, digest, and signature. Reject V = 𝒪; otherwise accept exactly when x(V) mod n equals r.' },
  ];
  return <>
    <Recall terms={['finite set', 'scalar', 'modular arithmetic', 'inverse', 'group', 'generator']}>Keep our d = {d} and Q = {pointLabel(Q)}. ECDSA adds a digest integer z and a nonce scalar k. Its equations combine the group multiplication you learned with arithmetic modulo n.</Recall>
    <Card number="01" title="Follow the signature, then verify it">
      <p><strong>ECDSA</strong> means Elliptic Curve Digital Signature Algorithm. A signature proves authorization by a key for a particular digest; it does not encrypt the message. Bitcoin uses ECDSA for legacy and SegWit v0 spends. Taproot uses Schnorr, which is outside this new mathematical lesson.</p>
      <div className="crypto-inline-controls"><label className="crypto-control">Toy digest z: {z}<input type="range" min="0" max="18" value={z} onChange={event => setZ(+event.target.value)} /></label><label className="crypto-control">Public teaching nonce k: {k}<input type="range" min="1" max="18" value={k} onChange={event => setK(+event.target.value)} /></label></div>
      <div className="crypto-step-buttons" role="group" aria-label="ECDSA mathematical steps">{signSteps.map((item, i) => <button key={i} className={step === i ? 'chosen' : ''} onClick={() => setStep(i)} aria-pressed={step === i}>{i + 1}. {item.title}</button>)}</div>
      <div className="crypto-two-col"><div aria-live="polite"><h3>{signSteps[step].title}</h3><p>{signSteps[step].text}</p><Formula>{signSteps[step].formula}</Formula><Playback current={step} count={5} select={setStep} label="ECDSA equations" /><p className={`crypto-status ${signature.valid ? 'pass' : 'fail'}`}>{signature.valid ? `Signature (${signature.r}, ${signature.s}) verifies with Q.` : 'This nonce/digest combination produces a zero signature component. Try another k.'}</p></div><CurvePlot P={Q} result={step >= 4 ? verification.V : signature.R} /></div>
      <p>For our small curve, z is already a chosen integer. For a general ECDSA curve, z is obtained from the leftmost bits of a digest, up to the bit length of n. For secp256k1 with SHA-256, all 256 digest bits are used; subsequent scalar equations reduce modulo n.</p>
    </Card>
    <Card number="02" title="Why verification reconstructs the nonce point">
      <p>From signing we know s ≡ k⁻¹(z + rd) (mod n). Multiply both sides by k, then by s⁻¹: k ≡ s⁻¹(z + rd) (mod n). Substitute the public-key construction Q = dG:</p>
      <Formula>V = (zs⁻¹)G + (rs⁻¹)Q<br />  = (zs⁻¹)G + (rs⁻¹)dG<br />  = [s⁻¹(z + rd)]G<br />  = kG = R</Formula>
      <p>Associativity and the scalar rules in the same group justify combining these terms. Scalars are equal modulo n, so their multiples of G are the same point. The verifier never needs to know d or k to check the x-coordinate equality.</p>
      <p>ECDSA also allows (r, n−s): it reconstructs −R, which has the same x coordinate. Bitcoin’s low-S conventions choose the smaller of s and n−s for a canonical representative; the real example shows both the algebraic s and its low-S encoding.</p>
    </Card>
    <Card number="03" title="Reuse a nonce and the private scalar becomes solvable">
      <p>Sign two different digest integers with the same k. The point R and scalar r stay the same; subtract the signature equations to eliminate rd. This exposes k, then d, through the modular inverses you learned.</p>
      <Formula>(z₁, s₁) = ({z}, {signature.s}) &nbsp; · &nbsp; (z₂, s₂) = ({secondZ}, {second.s})<br />k = (z₁ − z₂)(s₁ − s₂)⁻¹ mod n<br />d = (s₁k − z₁)r⁻¹ mod n</Formula>
      {recoveredK === null ? <p>This pair includes an unusable signature. Change k or z to obtain two nonzero signatures for the demonstration.</p> : <p className="crypto-status fail" aria-live="polite">Recovered k = {recoveredK} and d = {recoveredD}, matching your selected private scalar.</p>}
      <p>RFC 6979 derives a nonce deterministically from the private scalar and digest with a cryptographic procedure. It avoids reliance on fresh random sampling for each signature; it does not mean using a fixed nonce for different digests. The real example uses the pinned library’s RFC 6979 implementation.</p>
      <p>The displayed teaching equations use raw s values. Low-S-normalized signatures may require trying the corresponding sign choices in a nonce-reuse analysis.</p>
    </Card>
  </>;
}

function RealExample({ page, teachingD, result, privateHex, setPrivateHex, message, setMessage, run, runtime, onUsePublicKey }: {
  page: CryptographyPage; teachingD: number; result: CryptographyResult | null; privateHex: string; setPrivateHex: (value: string) => void;
  message: string; setMessage: (value: string) => void; run: (experiment?: 'original' | 'message' | 'key' | 'signature') => void;
  runtime: ReturnType<typeof usePython>; onUsePublicKey: (key: string) => void;
}) {
  const [pointStep, setPointStep] = useState(0);
  useEffect(() => setPointStep(0), [result]);
  const multiplication = result && 'multiplication' in result ? result.multiplication[Math.min(pointStep, result.multiplication.length - 1)] : null;
  return <Card number="04" title={page === 'private-keys' ? 'The same scalar set on secp256k1' : 'The same construction on secp256k1'} className="crypto-real">
    <Recall terms={['finite field', 'order', 'generator']}>Our teaching curve used p = 17 and n = 19. Bitcoin changes the parameters and size, while keeping the same field and group operations. Its curve has a = 0 and b = 7, rather than our teaching coefficients 2 and 2.</Recall>
    <Formula>{page === 'private-keys' ? 'D = {1, 2, …, n−1} · 1 ≤ d < n' : 'y² ≡ x³ + 7 (mod p) · Q = dG'}</Formula>
    <details className="crypto-details"><summary>Inspect the two different moduli and the generator</summary><Value label="p · coordinate field prime · hex" value={SECP_P.toString(16)} /><Value label="n · generator order · hex" value={SECP_N.toString(16)} /><Value label="G.x · hex" value="79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" /><Value label="G.y · hex" value="483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8" /><p>p = 2²⁵⁶ − 2³² − 977. G has prime order n; the cofactor is 1, meaning G’s subgroup is the entire curve group.</p></details>
    <p className="crypto-note">Public learning examples only. The lab displays private scalars and signing nonces. Do not enter a wallet’s secret key. Inputs stay in browser memory.</p>
    <p>By default this uses the same scalar d = {teachingD} carried above. Editing the hexadecimal input creates a separate example on Bitcoin’s curve.</p>
    <form onSubmit={event => { event.preventDefault(); run('original'); }}>
      <label className="crypto-control">Public learning private scalar · 32-byte hexadecimal<input value={privateHex} onChange={event => setPrivateHex(event.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!!runtime.error} /></label>
      {page === 'ecdsa' && <label className="crypto-control">Learning message · UTF-8<textarea value={message} onChange={event => setMessage(event.target.value)} rows={2} maxLength={512} /></label>}
      <button className="primary-button" type="submit" disabled={runtime.busy || runtime.status.state !== 'ready'}>{runtime.busy ? 'Calculating…' : 'Calculate in Python'}<ArrowRight size={15} /></button>
      <button className="text-button" type="button" onClick={() => setPrivateHex(hex32(teachingD))}><RotateCcw size={14} />Use carried scalar</button>
    </form>
    {runtime.status.state === 'loading' && <p role="status">{runtime.status.message} The small teaching diagrams are ready to explore.</p>}
    {runtime.status.state === 'error' && <div className="crypto-status fail" role="alert"><p>{runtime.status.message}</p><button className="secondary-button" onClick={runtime.retry}>Restart Python</button></div>}
    {runtime.error && <p className="crypto-status fail" role="alert">{runtime.error}</p>}
    {!result && runtime.status.state === 'ready' && !runtime.busy && !runtime.error && <p>Apply your example to calculate its current values.</p>}
    {result && <>
      <span className="crypto-calculated"><Check size={14} />Calculated with the browser Python libraries</span>
      <Value label="d · decimal" value={result.d} />
      {page !== 'private-keys' && 'Q' in result && <>
        <Value label="Q.x · 32-byte hex · coordinates modulo p" value={result.Q.x} /><Value label="Q.y · 32-byte hex · coordinates modulo p" value={result.Q.y} />
        <details className="crypto-details"><summary>Step through the actual binary multiplication ({result.multiplication.length} bits)</summary>
          <label className="crypto-control">Binary digit: {pointStep + 1}<input type="range" min="0" max={result.multiplication.length - 1} value={pointStep} onChange={event => setPointStep(+event.target.value)} /></label>
          {multiplication && <><Formula>Read bit {multiplication.bit} → double{multiplication.bit === '1' ? ', then add G' : ', keep the doubled point'}</Formula><Value label="Before · x coordinate (𝒪 means identity)" value={multiplication.before?.x ?? '𝒪'} /><Value label="After doubling · x" value={multiplication.doubled?.x ?? '𝒪'} /><Value label="After this bit · x" value={multiplication.result?.x ?? '𝒪'} /></>}
          <p>The final accumulator is Q. This educational trace uses library points and the same recurrence as the small curve.</p>
        </details>
        <h3>Serialize the point into public-key bytes</h3>
        <p>SEC (Standards for Efficient Cryptography) specifies point encodings. Uncompressed SEC format is 04 || x || y (65 bytes). Compressed SEC format is 02 || x if y is even, or 03 || x if y is odd (33 bytes). The symbol || means concatenate bytes; each coordinate is padded to 32 bytes.</p>
        <Value label="Compressed SEC · parity prefix + x" value={result.compressed} /><Value label="Uncompressed SEC · 04 + x + y" value={result.uncompressed} />
        <details className="crypto-details"><summary>How can x and one parity bit reconstruct y?</summary><p>Compute α = x³ + 7 mod p. Because secp256k1 has p ≡ 3 (mod 4), α^((p+1)/4) mod p gives a candidate square root for a valid curve x. Its two possible roots are y and p−y; the prefix selects the even or odd root. Invalid inputs must be checked for range and for satisfying the curve equation.</p><Value label="α · hex" value={result.alpha} /><Value label="Reconstructed y · hex" value={result.recoveredY} /><p>This matches Q.y above. Compression changes the representation, not the underlying group point.</p></details>
        <button className="secondary-button" onClick={() => onUsePublicKey(result.compressed)}>Use this public key in Addresses <ArrowRight size={15} /></button>
      </>}
      {page === 'ecdsa' && 'verification' in result && <>
        <h3>Sign the message digest, then change what is verified</h3>
        <p>This is SHA-256 of the learning message, rather than a Bitcoin transaction sighash. The signature uses the same secp256k1 key pair above. Every number below is hexadecimal unless labelled otherwise.</p>
        <Value label="SHA-256(message) · digest = z in big-endian hex" value={result.digest} /><Value label="k · RFC 6979 nonce · publicly exposed for this example" value={result.k} /><Value label="R.x · coordinate modulo p" value={result.R.x} /><Value label="r = R.x mod n" value={result.r} /><Value label="s = k⁻¹(z + rd) mod n · raw algebraic s" value={result.s} /><Value label="Low-S representative · min(s, n−s)" value={result.lowS} /><Value label="Low-S DER signature · encodes the two integers r and s" value={result.der} />
        <div className="crypto-step-buttons" role="group" aria-label="Real ECDSA verification experiments">{(['original', 'message', 'key', 'signature'] as const).map(experiment => <button key={experiment} className={result.verification.experiment === experiment ? 'chosen' : ''} onClick={() => run(experiment)} disabled={runtime.busy}>{experiment === 'original' ? 'Original' : experiment === 'message' ? 'Change message' : experiment === 'key' ? 'Change public key' : 'Change signature r'}</button>)}</div>
        <p>Each experiment keeps the original signature’s s and changes only the selected verification input. Choosing Original restores all verification inputs.</p>
        <Value label="Verification digest · z" value={result.verification.digest} /><Value label="Verification public key · Q.x" value={result.verification.Q.x} /><Value label="Verification signature · r" value={result.verification.r} /><Value label="w = s⁻¹ mod n" value={result.verification.w} /><Value label="u₁ = zw mod n" value={result.verification.u1} /><Value label="u₂ = rw mod n" value={result.verification.u2} /><Value label="V = u₁G + u₂Q · x coordinate" value={result.verification.V?.x ?? '𝒪 · reject the identity'} />
        <p className={`crypto-status ${result.verification.valid ? 'pass' : 'fail'}`} role="status">{result.verification.valid ? 'Signature verifies: x(V) mod n equals r.' : 'Signature rejected: the verification equation fails.'}</p>
        <p>DER (Distinguished Encoding Rules) is a structured encoding of integers, not the curve operation itself. A Bitcoin transaction signature additionally carries a sighash-type byte. Continue to <a href="#signing">Transaction Signing</a> to see how transaction bytes determine the digest.</p>
      </>}
      <details className="crypto-details"><summary>Replay the exact Python calculation</summary><CopyCode value={result.python} /><pre>{result.python}</pre><p>{page === 'private-keys' ? 'Validates the scalar against the secp256k1 order from ecdsa, then serializes the integer into 32 bytes.' : page === 'public-keys' ? 'Uses bitcoin-utils and ecdsa to construct the public point and encode its SEC bytes.' : 'Uses the existing bitcoin-utils and ecdsa packages to calculate keys and message signatures locally.'}</p></details>
    </>}
  </Card>;
}

export function CryptographyLesson({ page, visible, runtime, onUsePublicKey }: { page: CryptographyPage; visible: boolean; runtime: ReturnType<typeof usePython>; onUsePublicKey: (key: string) => void }) {
  const [foundation, setFoundation] = useState(0), [d, setD] = useState(7);
  const [privateHex, setPrivateHex] = useState(hex32(7)), [message, setMessage] = useState(INITIAL_MESSAGE);
  const [result, setResult] = useState<CryptographyResult | null>(null);
  const pending = useRef<LessonInput | null>(null);
  const { calculate, invalidate } = runtime;
  const index = CRYPTOGRAPHY_ORDER.indexOf(page), definition = CATALOG[page];
  function run(experiment: 'original' | 'message' | 'key' | 'signature' = 'original') {
    setResult(null);
    const request: LessonInput = { kind: page, network: 'mainnet', publicKey: '', compressed: true, cryptography: { privateHex, message, experiment } };
    pending.current = request; calculate(request);
  }
  function editHex(value: string) { setPrivateHex(value); setResult(null); pending.current = null; invalidate(); }
  function selectD(value: number) { setD(value); editHex(hex32(value)); }
  function editMessage(value: string) { setMessage(value); setResult(null); pending.current = null; invalidate(); }
  useEffect(() => {
    if (visible && page !== 'crypto-prerequisites') run();
    else pending.current = null;
    // Returning to a lesson uses its carried example; typing requires Apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, page, calculate]);
  useEffect(() => {
    if (visible && runtime.traceInput === pending.current && runtime.trace?.cryptography) setResult(runtime.trace.cryptography);
  }, [visible, runtime.trace, runtime.traceInput]);
  if (!visible) return null;
  return <div className="crypto-lesson">
    <section className="hero"><div className="hero-copy"><div className="hero-meta"><span className="chapter-tag">CHAPTER 0{index + 1}</span><span>CRYPTOGRAPHY</span></div><h1>{definition.title}<br /><span>{definition.accent}</span></h1><p>{definition.description}</p></div><div className="crypto-hero-symbol" aria-hidden="true">{page === 'crypto-prerequisites' ? '{ }' : page === 'private-keys' ? 'd' : page === 'public-keys' ? 'dG' : '(r,s)'}</div></section>
    <nav className="crypto-page-path" aria-label="Cryptography learning sequence">{CRYPTOGRAPHY_ORDER.map((id, i) => <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined}><span>0{i + 1}</span>{CATALOG[id].nav}</a>)}</nav>
    <div className="crypto-example-ribbon"><KeyRound size={18} /><div><strong>One example, carried through every lesson</strong><span>{page === 'crypto-prerequisites' && foundation < 4 ? 'Build the example: sets → arithmetic → a curve group.' : 'Teaching curve: p = 17 · n = 19 · G = (5, 1)'}</span></div>{page !== 'crypto-prerequisites' && <label>d = <select aria-label="Carried teaching private scalar" value={d} onChange={event => selectD(+event.target.value)}>{Array.from({ length: 18 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>}</div>
    {page === 'crypto-prerequisites' && <>
      <p className="crypto-intro">Start here; no cryptography background is assumed. Each step supplies the terms and operations used by the next. Our small curve is intentionally easy to inspect and break; it uses the same mathematical machinery as Bitcoin with different parameters.</p>
      <div className="crypto-foundations" role="group" aria-label="Mathematical prerequisites">{FOUNDATIONS.map((title, i) => <button key={title} className={foundation === i ? 'chosen' : ''} aria-pressed={foundation === i} onClick={() => setFoundation(i)}><span>0{i + 1}</span>{title}</button>)}</div>
      <Card number={`0${foundation + 1}`} title={FOUNDATIONS[foundation]}>
        {foundation === 0 && <SetExplorer />}{foundation === 1 && <NumberExplorer />}{foundation === 2 && <ModularExplorer />}{foundation === 3 && <FieldExplorer />}{foundation === 4 && <GroupExplorer />}{foundation === 5 && <CurveExplorer />}
        <div className="crypto-foundation-next"><button className="secondary-button" disabled={foundation === 0} onClick={() => setFoundation(foundation - 1)}><ArrowLeft size={15} />Previous concept</button>{foundation < 5 ? <button className="primary-button" onClick={() => setFoundation(foundation + 1)}>Next: {FOUNDATIONS[foundation + 1]}<ArrowRight size={15} /></button> : <a className="primary-button" href="#private-keys">Next: choose a private scalar<ArrowRight size={15} /></a>}</div>
      </Card>
      {foundation === 5 && <div className="crypto-note">We now have a finite field for coordinates, a finite group of points, and a generator of known order. Next we choose d from the associated finite set of allowed private scalars.</div>}
    </>}
    {page === 'private-keys' && <PrivateKeys d={d} setD={selectD} privateHex={privateHex} />}
    {page === 'public-keys' && <PublicKeys d={d} />}
    {page === 'ecdsa' && <EcdsaLesson d={d} />}
    {page !== 'crypto-prerequisites' && <RealExample page={page} teachingD={d} result={result} privateHex={privateHex} setPrivateHex={editHex} message={message} setMessage={editMessage} run={run} runtime={runtime} onUsePublicKey={onUsePublicKey} />}
    <details className="panel crypto-card crypto-glossary"><summary>Keep the vocabulary close</summary><dl>{Object.entries(TERMS).map(([term, description]) => <div key={term}><dt>{term}</dt><dd>{description}</dd></div>)}</dl><button className="text-button" onClick={() => { setFoundation(0); location.hash = 'crypto-prerequisites'; }}>Revisit the prerequisite walkthrough <ArrowRight size={14} /></button></details>
    <div className="lesson-sources">Read the specifications: <a href="https://www.secg.org/sec1-v2.pdf" target="_blank" rel="noreferrer">SEC 1 · mathematical foundations & ECDSA</a><a href="https://www.secg.org/sec2-v2.pdf" target="_blank" rel="noreferrer">SEC 2 · secp256k1</a><a href="https://www.rfc-editor.org/rfc/rfc6979" target="_blank" rel="noreferrer">RFC 6979 · deterministic nonces</a></div>
    <nav className="crypto-lesson-next" aria-label="Continue learning">{index > 0 && <a className="secondary-button" href={`#${CRYPTOGRAPHY_ORDER[index - 1]}`}><ArrowLeft size={15} />{CATALOG[CRYPTOGRAPHY_ORDER[index - 1]].nav}</a>}<a className="primary-button" href={index < 3 ? `#${CRYPTOGRAPHY_ORDER[index + 1]}` : '#p2pkh'}>{index < 3 ? `Next: ${CATALOG[CRYPTOGRAPHY_ORDER[index + 1]].nav}` : 'Next: Addresses'}<ArrowRight size={15} /></a></nav>
  </div>;
}
