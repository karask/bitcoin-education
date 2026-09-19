import { useState } from 'react';
import type { StepResult } from './types';

export function SymbolExplorer({ symbols }: { symbols: NonNullable<StepResult['symbols']> }) {
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, symbols.values.length - 1);
  return <div className="symbol-explorer">
    <div className="output-meta"><span>FIVE-BIT SYMBOLS</span><span>{symbols.values.length} values · 0–31</span></div>
    <p>{symbols.description}</p>
    <div className="symbol-grid">{symbols.values.map((value, i) => <button key={i} className={i === index ? 'selected' : ''} onMouseEnter={() => setSelected(i)} onFocus={() => setSelected(i)} onClick={() => setSelected(i)} aria-pressed={i === index} aria-label={`Symbol ${i + 1}: value ${value}, character ${symbols.characters[i]}`}><span>{value.toString(2).padStart(5, '0')}</span><strong>{symbols.characters[i]}</strong><small>{value}</small></button>)}</div>
    <div className="symbol-inspector" aria-live="polite">Symbol {index + 1}: <code>{symbols.values[index].toString(2).padStart(5, '0')}</code> is value <strong>{symbols.values[index]}</strong>, represented by <code>{symbols.characters[index]}</code>.</div>
  </div>;
}

export function AddressParts({ parts }: { parts: NonNullable<StepResult['addressParts']> }) {
  const [selected, setSelected] = useState(0);
  return <div className="address-parts"><div className="address-parts-row">{parts.map((part, i) => <button key={part.label} className={i === selected ? 'selected' : ''} onClick={() => setSelected(i)} onFocus={() => setSelected(i)} onMouseEnter={() => setSelected(i)} aria-pressed={i === selected}><small>{part.label}</small><code>{part.value}</code></button>)}</div><p aria-live="polite">{parts[selected].description}</p></div>;
}
