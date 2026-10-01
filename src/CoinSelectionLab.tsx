import { useMemo, useState } from 'react';
import { ArrowRight, Coins, Layers, RotateCcw, Wallet } from 'lucide-react';
import type { Network, TransactionImport } from './types';
import { comparisonFee } from './comparisonMath';
import { inputVsize, parsePayment, quoteSelection, selectCoins, SPEND_BUDGETS, type SelectionStrategy, type WalletSpend } from './coinSelection';
import { fundingDraft, WALLET_ADDRESSES, WALLET_COINS } from './coinSelectionExamples';
import './coins.css';

const STRATEGIES: { id: SelectionStrategy; title: string; description: string }[] = [
  { id: 'fewest', title: 'Fewest inputs', description: 'Use fewer coins, then favor the lower fee and smaller change.' },
  { id: 'change', title: 'Smallest change', description: 'Minimize the change output, even when that requires more inputs.' },
  { id: 'consolidate', title: 'Consolidate', description: 'Combine coins worth more than their estimated input fee. More inputs cost more now.' },
];
const sats = (amount: number) => amount.toLocaleString('en-US');
const balance = WALLET_COINS.reduce((sum, coin) => sum + coin.amount, 0);

export function CoinSelectionLab({ onContinue }: { onContinue: (selection: TransactionImport) => void }) {
  const [paymentText, setPayment] = useState('60000');
  const [rate, setRate] = useState('5');
  const [type, setType] = useState<WalletSpend>('p2wpkh');
  const [network, setNetwork] = useState<Network>('mainnet');
  const [mode, setMode] = useState<SelectionStrategy | 'manual'>('fewest');
  const [manualIds, setManualIds] = useState<string[]>(['coin-a']);
  const payment = parsePayment(paymentText), rateValid = comparisonFee(1, rate) !== null;
  const valid = payment !== null && rateValid;
  const comparisons = useMemo(() => valid ? STRATEGIES.map(strategy => {
    const coins = selectCoins(WALLET_COINS, payment!, rate, type, strategy.id);
    return { ...strategy, coins, quote: quoteSelection(coins, payment!, rate, type) };
  }) : [], [valid, payment, rate, type]);
  const selected = mode === 'manual' ? WALLET_COINS.filter(coin => manualIds.includes(coin.id)) : comparisons.find(strategy => strategy.id === mode)?.coins ?? [];
  const quote = valid ? quoteSelection(selected, payment!, rate, type) : null;
  const cost = rateValid ? comparisonFee(inputVsize(type), rate)! : null;
  const addresses = WALLET_ADDRESSES[network][type];
  function toggle(id: string) {
    const next = new Set(selected.map(coin => coin.id));
    if (next.has(id)) next.delete(id); else next.add(id);
    setManualIds([...next]); setMode('manual');
  }
  function reset() { setPayment('60000'); setRate('5'); setType('p2wpkh'); setNetwork('mainnet'); setMode('fewest'); setManualIds(['coin-a']); }
  function proceed() {
    if (!quote?.funded) return;
    onContinue({ id: crypto.randomUUID(), network, draft: fundingDraft(selected, quote, type, network),
      funding: { rate, estimatedVsize: quote.vsize, estimatedFee: quote.fee, strategy: mode === 'manual' ? 'Manual selection' : STRATEGIES.find(strategy => strategy.id === mode)!.title } });
  }

  return <div className="coin-lab">
    <section className="hero"><div className="hero-copy"><div className="hero-meta"><span className="chapter-tag">TRANSACTIONS / START HERE</span><span>FICTIONAL WALLET</span></div><h1>A balance is a collection.<br /><span>Choose the pieces.</span></h1><p>Your wallet has eight unspent outputs. Which ones should fund the next payment? Pick a strategy, or take the controls yourself.</p></div></section>
    <aside className="coin-intro"><Coins size={26} /><div><strong>You spend outputs, not slices of a balance.</strong><p>A UTXO is an unspent transaction output, identified by its transaction ID and output index. Spending consumes it entirely. New outputs pay the recipient and return change; the amount left over pays the fee.</p></div></aside>
    <section className="panel coin-payment" aria-label="Payment settings"><div className="coin-heading"><div><span className="output-kicker">01 / PLAN THE PAYMENT</span><h2>Where should the pieces go?</h2></div><button className="text-button" onClick={reset}><RotateCcw size={14} />Reset wallet</button></div>
      <div className="coin-controls"><label>Payment <span>sats</span><input aria-label="Coin selection payment" inputMode="numeric" value={paymentText} aria-invalid={payment === null || (payment !== null && payment < SPEND_BUDGETS[type].dust)} aria-describedby="coin-payment-help" onChange={event => setPayment(event.target.value)} /></label><label>Fee rate <span>sat/vB</span><input aria-label="Coin selection fee rate" inputMode="decimal" value={rate} aria-invalid={!rateValid} aria-describedby="coin-rate-help" onChange={event => setRate(event.target.value)} /></label><label>Wallet input type<select aria-label="Wallet input type" value={type} onChange={event => setType(event.target.value as WalletSpend)}>{(Object.keys(SPEND_BUDGETS) as WalletSpend[]).map(id => <option key={id} value={id}>{SPEND_BUDGETS[id].label}</option>)}</select></label><label>Address network<select aria-label="Coin selection network" value={network} onChange={event => setNetwork(event.target.value as Network)}><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select></label></div>
      <p id="coin-payment-help" className={payment === null || (payment !== null && payment < SPEND_BUDGETS[type].dust) ? 'input-error' : 'coin-note'}>{payment === null ? 'Enter a whole-satoshi payment from 1 to 1,000,000.' : payment < SPEND_BUDGETS[type].dust ? `The payment is below the modeled ${SPEND_BUDGETS[type].dust}-sat dust threshold for this output type.` : 'Payment and change use the selected type. Changing type creates another fictional wallet with the same amounts.'}</p>
      <p id="coin-rate-help" className={rateValid ? 'coin-note' : 'input-error'}>{rateValid ? 'Choose a hypothetical fee rate. This is a signed-size estimate; Signing will measure the actual transaction.' : 'Enter 0.01–1,000 sat/vB, with up to four decimal places.'}</p>
    </section>

    <section className="coin-strategies" aria-label="Compare coin selection strategies"><div className="coin-heading"><div><span className="output-kicker">02 / CHOOSE A STRATEGY</span><h2>Same payment. Different choices.</h2></div><button className={`secondary-button ${mode === 'manual' ? 'selected' : ''}`} aria-pressed={mode === 'manual'} onClick={() => { setManualIds(selected.map(coin => coin.id)); setMode('manual'); }}>Select by hand</button></div><div className="coin-strategy-grid">{STRATEGIES.map(strategy => {
      const choice = comparisons.find(item => item.id === strategy.id);
      return <button key={strategy.id} className={`panel coin-strategy ${mode === strategy.id ? 'selected' : ''}`} aria-pressed={mode === strategy.id} disabled={!valid} onClick={() => setMode(strategy.id)}><strong>{strategy.title}</strong><p>{strategy.description}</p>{choice?.quote.funded ? <div><span>{choice.coins.length} {choice.coins.length === 1 ? 'input' : 'inputs'}</span><span>{sats(choice.quote.fee)} sats fee</span><span>{sats(choice.quote.change)} sats change</span><span>{choice.quote.addresses} receiving {choice.quote.addresses === 1 ? 'address' : 'addresses'}</span></div> : <small>{valid ? 'Cannot fund this payment at this rate.' : 'Enter a valid payment and fee rate.'}</small>}</button>;
    })}</div><p className="coin-note">These teaching strategies search a small wallet. They do not reproduce Bitcoin Core’s coin-selection algorithms. Selecting any coin below switches to manual mode.</p></section>

    <div className="coin-workspace"><section className="panel coin-wallet" aria-label="Fictional wallet coins"><div className="coin-heading"><div><span className="output-kicker">03 / INSPECT THE UTXOS</span><h2><Wallet size={20} />{sats(balance)} <small>sats in 8 coins</small></h2></div><span className="coin-mode">{mode === 'manual' ? 'Manual selection' : STRATEGIES.find(item => item.id === mode)!.title}</span></div><p className="coin-note">All coins are fictional, confirmed ordinary outputs controlled by public learning keys. The labels below are wallet notes, not transaction fields.</p>
      <div className="coin-list">{WALLET_COINS.map((coin, index) => <article key={coin.id} className={`coin ${selected.some(item => item.id === coin.id) ? 'selected' : ''}`}><label className="coin-choice"><input type="checkbox" aria-label={`Select coin ${String.fromCharCode(65 + index)} · ${coin.amount} sats`} checked={selected.some(item => item.id === coin.id)} onChange={() => toggle(coin.id)} /><span className="coin-letter">{String.fromCharCode(65 + index)}</span><div><strong>{sats(coin.amount)} <small>sats</small></strong><span>{coin.label} · receiving address {coin.key === 1 ? '1' : coin.key === 3 ? '2' : '3'}</span></div><span className={`coin-effective ${cost !== null && coin.amount <= cost ? 'uneconomic' : ''}`}>{cost === null ? '—' : `${sats(coin.amount - cost)} sats effective`}</span></label><details><summary>Inspect coin {String.fromCharCode(65 + index)} · outpoint and lock</summary><dl><dt>Transaction ID · display order</dt><dd><code>{coin.txid}</code></dd><dt>Output index · vout</dt><dd>{coin.vout}</dd><dt>Receiving address · {SPEND_BUDGETS[type].label}</dt><dd><code>{addresses[String(coin.key) as '1' | '3' | '4']}</code></dd></dl></details></article>)}</div>
      <p className="coin-note">Effective value = amount − estimated fee to add this input{cost !== null ? ` (${sats(cost)} sats here)` : ''}. A nonpositive value makes funding harder at this rate. You can still select it manually to see the effect.</p>
    </section>

    <section className="panel coin-plan" aria-label="Selected payment plan" aria-live="polite"><span className="output-kicker">04 / FOLLOW THE VALUE</span><h2>{quote?.funded ? 'Every sat has a destination.' : 'Can these coins cover it?'}</h2><dl className="coin-equation"><div><dt>Selected coins <small>{selected.length} {selected.length === 1 ? 'input' : 'inputs'}</small></dt><dd data-testid="coin-selected-total">{sats(selected.reduce((sum, coin) => sum + coin.amount, 0))} sats</dd></div><div><dt>Recipient payment</dt><dd>{payment === null ? '—' : `${sats(payment)} sats`}</dd></div><div><dt>{quote?.funded ? 'Budgeted fee' : 'Minimum estimated fee'}</dt><dd data-testid="coin-fee">{quote ? `${sats(quote.funded ? quote.fee : quote.minimumFee)} sats` : '—'}</dd></div><div><dt>Change back to wallet</dt><dd data-testid="coin-change">{quote?.funded ? `${sats(quote.change)} sats` : '—'}</dd></div></dl>
      {quote && <p className={quote.funded ? 'coin-note' : 'coin-shortfall'} role="status">{quote.reason}{!quote.funded && quote.shortfall > 0 && ` Need ${sats(quote.shortfall)} more sats for this selection.`}</p>}
      {quote?.funded && <><div className="coin-plan-facts"><span><strong>{quote.vsize} vB</strong>estimated signed size</span><span><strong>{quote.hasChange ? '2 outputs' : '1 output'}</strong>{quote.hasChange ? 'payment + change' : 'payment only'}</span></div>{quote.extraFee > 0 && <p className="coin-shortfall">The remainder adds {sats(quote.extraFee)} sats above the minimum one-output fee. There is no change output.</p>}<p className="coin-note">{quote.hasChange ? <>Change goes to a different learning address: <code>{addresses['5']}</code>. It is a new UTXO, with no “change” flag in its bytes.</> : 'Every selected coin is fully consumed. The remainder is paid as a fee; it is not a hidden change balance.'}</p><p className="coin-after"><strong>{sats(balance - quote.payment - quote.fee)} sats</strong> left in the modeled wallet: unselected coins{quote.hasChange ? ' + new change' : ''}.</p></>}
      {quote && quote.addresses > 1 && <p className="coin-privacy"><Layers size={16} /><span>This selection combines {quote.addresses} receiving addresses. Observers may infer common ownership from inputs spent together; that heuristic is not proof. Wallet labels stay private to this page.</span></p>}
      {!!quote?.uneconomic && <p className="coin-shortfall">{quote.uneconomic} selected {quote.uneconomic === 1 ? 'coin costs' : 'coins cost'} at least as much to add as {quote.uneconomic === 1 ? 'its' : 'their'} value at this fee rate.</p>}
      <button className="primary-button coin-continue" disabled={!quote?.funded} onClick={proceed}>Use these coins in Anatomy<ArrowRight size={16} /></button><p className="coin-note">Carries the selected outpoints, amounts, locks, payment, change, and public learning keys into your draft. Sending again replaces the learner draft for this spend type.</p>
    </section></div>

    <details className="panel coin-assumptions"><summary>How the estimates and dust thresholds work</summary><p>The fee budget rounds the estimated signed virtual size up to a whole vbyte, then rounds vsize × your rate up to whole satoshis. ECDSA budgets use compressed keys and up to 71 DER bytes plus the SIGHASH byte; Taproot uses a 64-byte DEFAULT signature. Signing calculates the actual size and resulting fee rate.</p><p>This lab models dust at a fixed 3 sat/vB dust relay rate: P2PKH 546 sats, P2WPKH 294 sats, P2SH change 540 sats, Taproot 330 sats. That policy setting is separate from your payment fee rate. Dust is a relay-policy concept, not a consensus minimum; this is not a full node-policy implementation. A change output below the modeled threshold is omitted and the remainder becomes fee.</p><p>All UTXOs are assumed available and unspent. No chain lookup, coinbase maturity, mixed input types, transaction packages, replacement policy, live fee estimation, broadcast, or wallet persistence is modeled.</p></details>
    <div className="lesson-sources">References: <a href="https://github.com/bitcoin/bitcoin/blob/master/src/policy/policy.cpp" target="_blank" rel="noreferrer">Bitcoin Core · dust policy</a> · <a href="https://github.com/bitcoin/bitcoin/blob/master/src/wallet/coinselection.h" target="_blank" rel="noreferrer">Bitcoin Core · coin selection and change costs</a></div>
  </div>;
}
