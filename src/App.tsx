import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown,
  ChevronRight, Code2, Copy, Fingerprint, FlaskConical, HelpCircle, Info,
  Menu, Moon, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Sun, X,
} from 'lucide-react';
import type { ByteField, CodeMode, LessonInput, LessonKind, LessonTrace, StepResult, Theme } from './types';
import { EXAMPLE_PUBLIC_KEY, EXAMPLE_PUBLIC_KEYS } from './lessons';
import { CATALOG, LESSON_ORDER, lessonFromHash } from './lessonCatalog';
import { SymbolExplorer, AddressParts } from './EncodingExplorer';
import { ComparisonTable } from './ComparisonTable';
import type { LessonStep } from './lessons';
import { MultisigBuilder } from './MultisigBuilder';
import { usePython } from './usePython';
import { TransactionLesson } from './TransactionLesson';

const INITIAL_INPUT: LessonInput = { publicKey: EXAMPLE_PUBLIC_KEY, compressed: true, network: 'mainnet', kind: lessonFromHash(location.hash) ?? 'p2pkh', publicKeys: EXAMPLE_PUBLIC_KEYS, threshold: 2 };

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="36" height="36" /><div><strong>bit by bit<span>.</span></strong>{!compact && <small>THE BITCOIN LEARNING LAB</small>}</div></div>;
}

function CopyButton({ value, label = 'Copy', small = false }: { value: string; label?: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true); setFailed(false);
    } catch { setFailed(true); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCopied(false); setFailed(false); }, 2200);
  }
  return <button type="button" className={`copy-button ${small ? 'icon-only' : ''}`} onClick={copy} disabled={!value} aria-label={copied ? 'Copied' : failed ? 'Copy unavailable; select the text instead' : label} title={failed ? 'Select and copy the text manually' : label}>
    {copied ? <Check size={15} /> : <Copy size={15} />}{!small && <span>{copied ? 'Copied' : failed ? 'Select to copy' : label}</span>}
  </button>;
}

function Sidebar({ open, close, onAbout, kind }: { kind: LessonKind; open: boolean; close: () => void; onAbout: () => void }) {
  const [addressesExpanded, setAddressesExpanded] = useState(true);
  const [transactionsExpanded, setTransactionsExpanded] = useState(true);
  return <>
    {open && <button className="drawer-overlay" aria-label="Close navigation" onClick={close} />}
    <aside id="lesson-navigation" className={`sidebar ${open ? 'open' : ''}`} aria-label="Learning navigation" onKeyDown={(event) => {
      if (!open || event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="sidebar-brand"><Brand /><button className="icon-button drawer-close" aria-label="Close navigation" onClick={close}><X size={20} /></button></div>
      <div className="sidebar-intro">Understand Bitcoin.<br />One little piece at a time.</div>
      <div className="nav-caption">YOUR LEARNING PATH</div>
      <nav>
        <button type="button" className="topic-label" aria-expanded={addressesExpanded} aria-controls="address-lessons" onClick={() => setAddressesExpanded((expanded) => !expanded)}><span className="topic-icon"><Fingerprint size={18} /></span><span>Addresses</span>{addressesExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
        <div id="address-lessons" className="subnav" hidden={!addressesExpanded}>{addressesExpanded && LESSON_ORDER.map((id) => <a key={id} href={`#${id}`} onClick={close} aria-current={kind === id ? 'page' : undefined}><span className="active-dot" /><span>{CATALOG[id].nav}</span><span className="nav-tag">{id === 'nested' ? 'WRAPPED' : CATALOG[id].tag}</span></a>)}</div>
        <button type="button" className="topic-label" aria-expanded={transactionsExpanded} aria-controls="transaction-lessons" onClick={() => setTransactionsExpanded((expanded) => !expanded)}><span className="topic-icon"><ArrowRight size={18} /></span><span>Transactions</span>{transactionsExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
        <div id="transaction-lessons" className="subnav" hidden={!transactionsExpanded}>{transactionsExpanded && <a href="#transaction" onClick={close} aria-current={kind === 'transaction' ? 'page' : undefined}><span className="active-dot" /><span>Transaction anatomy</span><span className="nav-tag">P2PKH</span></a>}</div>
      </nav>
      <div className="sidebar-note"><div className="note-icon"><FlaskConical size={19} /></div><h3>A little curiosity goes a long way.</h3><p>Change an input. Follow the bytes. See what Bitcoin is really made of.</p><button onClick={onAbout}>How this lab works <ArrowUpRight size={14} /></button></div>
      <div className="sidebar-bottom"><div className="local-label"><span /> A browser-native playground</div><a href="https://github.com/karask/python-bitcoin-utils" target="_blank" rel="noreferrer">Built with <strong>python-bitcoin-utils</strong><ArrowUpRight size={12} /></a><span className="sidebar-version">Made for learning. Powered by real code.</span></div>
    </aside>
  </>;
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="about-dialog" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="about-title">
    <button className="icon-button modal-close" aria-label="Close about this lab" onClick={onClose}><X size={20} /></button>
    <div className="dialog-icon"><FlaskConical size={26} /></div>
    <span className="eyebrow">WELCOME TO THE LAB</span><h2 id="about-title">Real Python.<br />Right in your browser.</h2>
    <p>These are actual calculations from <strong>python-bitcoin-utils</strong>, running in a local Pyodide interpreter. There is no Python backend and your lesson inputs stay in this browser.</p>
    <div className="about-steps"><div><span>01</span><p><strong>Make it your own.</strong> Start with our public example key, or paste a different public key.</p></div><div><span>02</span><p><strong>Follow the transformation.</strong> Step through the process, or press Play. Switch between pseudocode and the exact Python being executed.</p></div><div><span>03</span><p><strong>Explore every byte.</strong> Hover, tap, or focus a colored field to learn what it means.</p></div></div>
    <p className="about-small">The example is public learning data. This lab is an educational tool, not a wallet. Only your theme preference is saved.</p>
    <button className="primary-button" onClick={onClose}>Let’s explore <ArrowRight size={16} /></button>
  </dialog>;
}

function StepTimeline({ current, select, disabled, steps }: { steps: readonly LessonStep[]; current: number; select: (step: number) => void; disabled: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = track.current;
    const active = container?.children[current] as HTMLElement | undefined;
    if (container && active && container.scrollWidth > container.clientWidth) {
      container.scrollLeft = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
    }
  }, [current]);
  return <div ref={track} className="step-timeline" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(75px, 1fr))` }} aria-label="Address construction steps">{steps.map((step, index) =>
    <button key={step.id} className={`timeline-step ${index === current ? 'current' : ''} ${index < current ? 'passed' : ''}`} onClick={() => select(index)} disabled={disabled} aria-current={index === current ? 'step' : undefined} aria-label={`Step ${index + 1}: ${step.short}`}>
      <span className="timeline-track"><span className="step-number">{index < current ? <Check size={12} strokeWidth={2.5} /> : String(index + 1).padStart(2, '0')}</span><span className="step-line" /></span><span className="step-name">{step.short}</span>
    </button>)}</div>;
}

function HighlightedCode({ code, mode }: { code: string; mode: CodeMode }) {
  const tokens = code.split(/(#[^\n]*|\b(?:from|import|True|False|bytes)\b|'[^']*'|"[^"]*"|\b\d+\b|\b[A-Za-z_][A-Za-z_0-9]*(?=\())/g);
  return <>{tokens.map((token, i) => {
    const style = token.startsWith('#') ? 'comment' : /^['"]/.test(token) ? 'string' : /^(from|import|True|False|bytes)$/.test(token) ? 'keyword' : /^\d+$/.test(token) ? 'number' : tokens[i + 1]?.startsWith('(') || (mode === 'pseudocode' && /^[A-Z][A-Z\d]+$/.test(token)) ? 'function' : '';
    return <span className={style ? `syntax-${style}` : undefined} key={i}>{token}</span>;
  })}</>;
}

function CodePanel({ current, mode, setMode, trace, select, steps, kind }: { steps: readonly LessonStep[]; kind: LessonKind; current: number; mode: CodeMode; setMode: (mode: CodeMode) => void; trace: LessonTrace | null; select: (step: number) => void }) {
  const [importsOpen, setImportsOpen] = useState(false);
  const code = mode === 'python' ? (trace ? `${trace.pythonPreamble}\n\n${trace.steps.map((step) => step.python).join('\n\n')}\nprint(address)` : '') : steps.map((step) => step.pseudo).join('\n');
  return <section className="panel code-panel" aria-label="Synchronized code">
    <div className="panel-toolbar"><div className="panel-label"><Code2 size={17} /><span>The process</span></div><div className="segmented code-tabs" aria-label="Code language"><button onClick={() => setMode('pseudocode')} className={mode === 'pseudocode' ? 'selected' : ''} aria-pressed={mode === 'pseudocode'}>Pseudocode</button><button onClick={() => setMode('python')} className={mode === 'python' ? 'selected' : ''} aria-pressed={mode === 'python'}>Python</button></div></div>
    <div className="code-file"><span><span className={`file-dot ${mode}`} />{mode === 'python' ? `${kind}.py` : `${kind} · a recipe`}</span><CopyButton small value={code} label={`Copy ${mode}`} /></div>
    <div className={`code-body ${mode}`}>
      <div className="code-comment">{mode === 'python' ? '# Composed from python-bitcoin-utils' : CATALOG[kind].multisig ? '// From a spending rule to a Bitcoin address' : '// From a public key to a Bitcoin address'}</div>
      {mode === 'python' && trace && <><button className="imports-toggle" onClick={() => setImportsOpen(!importsOpen)} aria-expanded={importsOpen}><ChevronRight size={13} className={importsOpen ? 'rotated' : ''} />Imports & setup <span>{importsOpen ? 'hide' : 'show'}</span></button>{importsOpen && <pre className="preamble"><HighlightedCode code={trace.pythonPreamble} mode={mode} /></pre>}</>}
      {steps.map((step, i) => <button className={`code-step ${current === i ? 'active' : ''} ${i < current ? 'executed' : ''}`} key={step.id} onClick={() => select(i)} disabled={!trace} aria-label={`Inspect step ${i + 1}: ${step.short}`} aria-current={current === i ? 'step' : undefined}>
        <span className="code-line-number">{String(i + 1).padStart(2, '0')}</span><span className="code-expression"><HighlightedCode code={mode === 'python' ? trace?.steps[i].python ?? '# Waiting for Python…' : step.pseudo} mode={mode} /></span><span className="code-current-marker">{current === i && <ArrowRight size={13} />}</span>
      </button>)}
    </div>
    <div className="code-footnote"><span className="small-dot" />{mode === 'python' ? 'These are the exact Python snippets used in this lesson.' : 'A readable recipe. Switch to Python to see the real calls.'}</div>
  </section>;
}

function ByteExplorer({ result, showLabel = true }: { result: StepResult; showLabel?: boolean }) {
  const explanationId = useId();
  const [selected, setSelected] = useState(result.fields[0].id);
  const active = result.fields.find((field) => field.id === selected) ?? result.fields[0];
  const selectedHex = result.hex.slice(active.start * 2, active.end * 2);
  function select(field: ByteField) { setSelected(field.id); }
  return <div className="byte-explorer">
    {showLabel && <div className="output-meta"><span>HEXADECIMAL</span><span>{result.byteLength} bytes <span className="meta-divider">/</span> {result.hex.length} characters</span></div>}
    <div className="hex-output" aria-label={`${result.byteLength} bytes of hexadecimal output`}>
      {result.fields.map((field) => <button type="button" key={field.id} className={`byte-field field-${field.id} ${selected === field.id ? 'inspected' : ''}`} onMouseEnter={() => select(field)} onFocus={() => select(field)} onClick={() => select(field)} aria-pressed={selected === field.id} aria-label={`${field.label}, ${field.end - field.start} ${field.end - field.start === 1 ? 'byte' : 'bytes'}`} aria-describedby={explanationId}>
        {result.hex.slice(field.start * 2, field.end * 2).match(/.{2}/g)?.map((byte, index) => <span className="hex-byte" key={index}>{byte}</span>)}
      </button>)}
    </div>
    <div className="byte-legend">{result.fields.map((field) => <button key={field.id} className={`legend-item field-${field.id} ${selected === field.id ? 'selected' : ''}`} onClick={() => select(field)} onFocus={() => select(field)} aria-pressed={selected === field.id}><span className="legend-dot" />{field.label}<span className="legend-count">{field.end - field.start}B</span></button>)}</div>
    <div className={`field-inspector field-${active.id}`} id={explanationId}>
      <div className="inspector-heading"><span className="legend-dot" /><strong>{active.label}</strong><span>byte {active.start}{active.end - active.start > 1 ? `–${active.end - 1}` : ''}</span></div>
      <p>{active.description}</p>
      <div className="inspector-value"><code>{selectedHex}</code><CopyButton small value={selectedHex} label={`Copy ${active.label.toLowerCase()}`} /></div>
    </div>
  </div>;
}

function ResultPanel({ result, current, lesson }: { result: StepResult; current: number; lesson: LessonStep }) {
  return <section className="panel result-panel" aria-label="Calculation output">
    <div className="panel-toolbar"><div className="panel-label"><span className="result-indicator" /><span>The result</span></div><span className="real-python"><ShieldCheck size={13} />Calculated in Python</span></div>
    <div className="result-body" key={result.id}>
      <div className="result-title-row"><div><span className="output-kicker">OUTPUT / {String(current + 1).padStart(2, '0')}</span><h3>{lesson.outputLabel}</h3></div><CopyButton small value={result.address ?? result.symbols?.characters ?? result.hex} label={result.address ? 'Copy address' : result.symbols ? 'Copy encoded symbols' : 'Copy output hex'} /></div>
      {result.intermediate && <div className="intermediate"><div><span>{result.intermediate.label}</span><span>32 bytes</span></div><code>{result.intermediate.hex}</code><ArrowDown size={15} /><span className="second-pass">SHA-256 again</span></div>}
      {result.address && <div className="address-result"><span className="address-result-badge"><Check size={12} />{(result.encoding ?? 'Base58Check').toUpperCase()} ENCODED</span><div data-testid="final-address">{result.address}</div><span>Readable. Shareable. Checksum included.</span></div>}
      {result.addressParts && <AddressParts parts={result.addressParts} />}
      {result.address && <div className="encoded-from">{result.encodedFrom ?? 'Encoded from these 25 bytes'} <ArrowDown size={13} /></div>}
      {result.symbols ? <SymbolExplorer symbols={result.symbols} /> : <ByteExplorer result={result} />}
      <div className="hover-hint"><Info size={13} /><span>Hover, tap, or focus a field to explore its meaning.</span></div>
    </div>
  </section>;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const drawerHadOpened = useRef(false);
  const [input, setInput] = useState<LessonInput>(INITIAL_INPUT);
  const [draft, setDraft] = useState(EXAMPLE_PUBLIC_KEY);
  const [draftKeys, setDraftKeys] = useState<string[]>(EXAMPLE_PUBLIC_KEYS);
  const [dirty, setDirty] = useState(false);
  const [current, setCurrent] = useState(0);
  const [mode, setMode] = useState<CodeMode>('pseudocode');
  const [playing, setPlaying] = useState(false);
  const runtime = usePython();
  const { calculate, invalidate } = runtime;
  const kind = input.kind ?? 'p2pkh';
  const isP2sh = kind === 'p2sh';
  const definition = CATALOG[kind];
  const steps = definition.steps;
  const lastStep = steps.length - 1;
  const lesson = steps[current];
  const result = runtime.trace?.steps[current];
  const ready = !!runtime.trace && !runtime.busy && !dirty;

  useEffect(() => { if (input.kind !== 'transaction') calculate(input); }, [input, calculate]);
  useEffect(() => {
    function navigate() {
      const next = lessonFromHash(location.hash);
      if (!next) return;
      invalidate(); setDirty(false); setPlaying(false); setCurrent(0);
      setInput((previous) => ({ ...previous, kind: next }));
      setDraft(input.publicKey); setDraftKeys(input.publicKeys ?? EXAMPLE_PUBLIC_KEYS);
    }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [invalidate, input.publicKey, input.publicKeys]);
  useEffect(() => {
    if (drawerOpen) {
      drawerHadOpened.current = true;
      document.querySelector<HTMLButtonElement>('.drawer-close')?.focus();
    } else if (drawerHadOpened.current) {
      document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
    }
  }, [drawerOpen]);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 700px)');
    const onResize = () => { if (!mobile.matches) setDrawerOpen(false); };
    mobile.addEventListener('change', onResize);
    return () => mobile.removeEventListener('change', onResize);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151816' : '#f6f5f1');
    try { localStorage.setItem('bit-by-bit-theme', theme); } catch { /* Storage is optional. */ }
  }, [theme]);
  useEffect(() => {
    if (!playing || !ready) return;
    if (current === steps.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setCurrent((value) => value + 1), 2800);
    return () => clearTimeout(timer);
  }, [playing, ready, current, steps.length]);
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
      const target = event.target as HTMLElement;
      if (kind === 'transaction' || !ready || aboutOpen || /INPUT|TEXTAREA|SELECT|BUTTON/.test(target.tagName) || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); setPlaying(false);
        setCurrent((value) => Math.max(0, Math.min(lastStep, value + (event.key === 'ArrowRight' ? 1 : -1))));
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [ready, aboutOpen, lastStep, kind]);

  function selectStep(step: number) { setCurrent(step); setPlaying(false); }
  function commit(changes: Partial<LessonInput> = {}) {
    invalidate();
    setInput({ ...input, publicKey: draft, publicKeys: draftKeys, ...changes });
    if (changes.publicKeys) setDraftKeys(changes.publicKeys);
    setDirty(false); setCurrent(0); setPlaying(false);
  }
  function editKey(value: string) {
    setDraft(value); setDirty(true); setPlaying(false); setCurrent(0); invalidate();
  }
  function editKeys(keys: string[]) { setDraftKeys(keys); setDirty(true); setPlaying(false); setCurrent(0); invalidate(); }
  function restoreExample() { setDraft(EXAMPLE_PUBLIC_KEY); commit({ publicKey: EXAMPLE_PUBLIC_KEY, publicKeys: EXAMPLE_PUBLIC_KEYS, threshold: 2 }); }

  return <div className="app-shell">
    <a href="#lesson-content" className="skip-link">Skip to lesson</a>
    <Sidebar kind={kind} open={drawerOpen} close={() => setDrawerOpen(false)} onAbout={() => { setAboutOpen(true); setDrawerOpen(false); }} />
    <div className="app-main" inert={drawerOpen}>
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="lesson-navigation" onClick={() => setDrawerOpen(true)}><Menu size={20} /></button><span className="breadcrumb-home">The learning lab</span><ChevronRight size={13} /><span>{kind === 'transaction' ? 'Transactions' : 'Addresses'}</span><ChevronRight size={13} /><strong>{definition.tag}</strong></div><div className="topbar-actions"><span className={`runtime-pill ${runtime.status.state}`} title={runtime.status.message}><span />{runtime.status.state === 'ready' ? 'Runs in your browser' : runtime.status.state === 'error' ? 'Python needs attention' : 'Starting Python'}</span><span className="toolbar-divider" /><button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button><button className="icon-button help-button" aria-label="About this learning lab" onClick={() => setAboutOpen(true)}><HelpCircle size={18} /></button></div></header>
      <main id="lesson-content" className="lesson-content">
        {kind === 'transaction' ? <TransactionLesson runtime={runtime} /> : <>
        <section className="hero" id={kind}><div className="hero-copy"><div className="hero-meta"><span className="chapter-tag">CHAPTER {String(LESSON_ORDER.indexOf(kind) + 1).padStart(2, '0')}</span><span>ADDRESSES</span><span className="hero-meta-dot">·</span><span>{steps.length} {kind === 'compare' ? 'constructions, one key' : 'steps, one transformation'}</span></div><h1>{definition.title}<br /><span>{definition.accent}</span></h1><p>{definition.description}</p></div><div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-core"><Fingerprint size={46} strokeWidth={1.2} /></div><span className="art-label label-top">{definition.multisig ? 'spending rule' : 'public key'}</span><span className="art-label label-bottom">{definition.tag}</span><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="art-spark">+</span></div></section>

        {definition.multisig ? <MultisigBuilder input={input} keys={draftKeys} dirty={dirty} error={runtime.error} edit={editKeys} commit={commit} restore={restoreExample} /> : <section className="input-card" aria-label="Lesson inputs"><div className="input-card-heading"><div><span className="section-index">01</span><h2>Your starting point</h2><span className="input-helper">Change it. See what happens.</span></div><button className="text-button" onClick={restoreExample}><RotateCcw size={13} />Use example</button></div><form onSubmit={(event) => { event.preventDefault(); commit(); }}><div className="public-key-input"><label htmlFor="public-key">Public key <span>{kind === 'p2pkh' ? 'SEC format' : 'Compressed SEC · 33 bytes'} · hexadecimal</span></label><div className={`key-input-wrap ${runtime.error ? 'has-error' : ''}`}><Fingerprint size={16} /><input id="public-key" value={draft} onChange={(event) => editKey(event.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!!runtime.error} aria-describedby={runtime.error ? 'input-error' : 'key-help'} /><button type="submit" className={`apply-input ${dirty ? 'dirty' : ''}`} aria-label="Apply public key" title="Apply public key"><ArrowRight size={17} /></button></div><span id="key-help" className="sr-only">{kind === 'p2pkh' ? 'Use a 33-byte compressed or 65-byte uncompressed public key.' : 'Use a 33-byte compressed public key beginning with 02 or 03.'} Apply your changes to recalculate.</span></div><div className="input-options"><div><label htmlFor="network">Network</label><div className="select-wrap"><span className={`network-dot ${input.network}`} /><select id="network" value={input.network} onChange={(event) => commit({ network: event.target.value as LessonInput['network'] })}><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select><ChevronDown size={13} /></div></div>{kind === 'p2pkh' && <div><span className="control-label" id="format-label">Public-key format</span><div className="segmented format-toggle" role="group" aria-labelledby="format-label"><button type="button" className={input.compressed ? 'selected' : ''} onClick={() => commit({ compressed: true })} aria-pressed={input.compressed}>Compressed</button><button type="button" className={!input.compressed ? 'selected' : ''} onClick={() => commit({ compressed: false })} aria-pressed={!input.compressed}>Uncompressed</button></div></div>}</div></form>{runtime.error && <div className="input-error" id="input-error" role="alert"><Info size={15} />{runtime.error}</div>}{dirty && <p className="draft-notice">Press Enter or the arrow to apply your public key.</p>}</section>}

        {kind === 'compare' && ready && runtime.trace?.comparisons && <ComparisonTable rows={runtime.trace.comparisons} current={current} select={selectStep} />}
        <section className="walkthrough" aria-label={`${kind.toUpperCase()} walkthrough`}><div className="walkthrough-heading"><div><span className="section-index">02</span><h2>Follow the transformation</h2></div><span className="interactive-label"><Sparkles size={13} />INTERACTIVE WALKTHROUGH</span></div><StepTimeline steps={steps} current={current} select={selectStep} disabled={!ready} />
          <div className="step-intro" aria-live="polite"><div className="step-title"><span className="step-eyebrow">STEP {String(current + 1).padStart(2, '0')} <span>/</span> {lesson.eyebrow}</span><h2>{lesson.title}</h2></div><p>{lesson.description}</p></div>
          <div className="workspace"><CodePanel steps={steps} kind={kind} current={current} mode={mode} setMode={setMode} trace={runtime.trace} select={selectStep} />{result && ready ? <ResultPanel lesson={lesson} result={result} current={current} /> : <section className="panel empty-result" aria-live="polite"><div className="runtime-illustration"><FlaskConical size={28} /></div><h3>{runtime.status.state === 'error' ? 'Let’s reconnect Python.' : runtime.error ? 'A small adjustment is needed.' : dirty ? 'Make this experiment yours.' : 'Warming up the lab.'}</h3><p>{runtime.status.state === 'error' ? runtime.status.message : runtime.error ? runtime.error : dirty ? 'Apply your inputs to see their transformation, one byte at a time.' : runtime.status.message}</p>{runtime.status.state === 'loading' && <div className="runtime-progress" role="progressbar" aria-label="Loading browser Python" aria-valuenow={runtime.status.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${runtime.status.progress}%` }} /></div>}{runtime.status.state === 'error' && <><button className="secondary-button" onClick={runtime.retry}><RotateCcw size={15} />Restart Python</button><small>Missing runtime files? Run <code>npm run setup:runtime</code> once.</small></>}{runtime.error && <button className="secondary-button" onClick={restoreExample}>Try the example <ArrowRight size={15} /></button>}{dirty && <button className="secondary-button" onClick={() => commit()}>Apply inputs <ArrowRight size={15} /></button>}<span className="empty-result-note"><ShieldCheck size={13} />Calculations happen entirely in this browser.</span></section>}</div>
          <div className="insight"><span className="insight-icon"><BookOpen size={18} /></span><div><strong>A little deeper</strong><p>{lesson.insight}</p></div></div>
          <div className="playback-bar"><div className="playback-left"><button className="play-button" onClick={() => { if (current === lastStep) setCurrent(0); setPlaying(!playing); }} disabled={!ready} aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}<span>{playing ? 'Pause' : 'Play'}</span></button><button className="icon-button reset-button" onClick={() => selectStep(0)} disabled={!ready} title="Restart walkthrough" aria-label="Restart walkthrough"><RotateCcw size={16} /></button><span className="playback-progress">Step <strong>{current + 1}</strong> of {steps.length}</span></div><div className="playback-right"><button className="back-button" aria-label="Previous step" onClick={() => selectStep(current - 1)} disabled={!ready || current === 0}><ArrowLeft size={16} /><span>Previous</span></button><button className="primary-button next-button" onClick={() => selectStep(current === lastStep ? 0 : current + 1)} disabled={!ready}>{current === lastStep ? 'Explore again' : 'Next step'}{current === lastStep ? <RotateCcw size={15} /> : <ArrowRight size={16} />}</button></div></div>
        </section>
        {isP2sh && <section className="locking-card panel" aria-label="What locks the funds">
          <div className="locking-heading"><span className="section-index">03</span><h2>What actually locks the funds?</h2></div>
          <div className="concept-grid"><div><span>01 / REDEEM SCRIPT</span><h3>The spending rule</h3><p>The full rule and its public keys. The spender reveals it when spending.</p></div><div><span>02 / P2SH ADDRESS</span><h3>The shareable encoding</h3><p>A network version, script hash, and checksum encoded for sharing.</p></div><div><span>03 / OUTPUT SCRIPT</span><h3>The lock on the funds</h3><p>The transaction output commits to the script hash below.</p></div></div>
          <code className="locking-asm">OP_HASH160 &lt;20-byte script hash&gt; OP_EQUAL</code>
          {ready && runtime.trace?.outputScript ? <><ByteExplorer key={runtime.trace.address} result={runtime.trace.outputScript} /><details className="spend-details"><summary>See the Python that creates this output script</summary><pre>{runtime.trace.outputScript.python}</pre><CopyButton label="Copy full Python example" value={`${runtime.trace.pythonPreamble}\n\n${runtime.trace.steps.map((step) => step.python).join('\n\n')}\n\n${runtime.trace.outputScript.python}\nprint(output_script.to_hex())`} /></details></> : <p className="pending-output">Apply valid inputs to inspect the calculated output script.</p>}
          <details className="spend-details"><summary>How is it spent?</summary><p>The spender reveals the original redeem script. Its HASH160 must match the commitment in the output. Bitcoin then executes that redeem script: this example requires {input.threshold} valid {input.threshold === 1 ? 'signature' : 'signatures'} corresponding to its public keys.</p><p>This is a conceptual explanation. The walkthrough constructs scripts and addresses; it does not execute scripts or sign transactions.</p></details>
          <div className="experiments"><span className="eyebrow">TRY IT YOURSELF</span><h3>Small changes. Different commitments.</h3><ul><li>Change 2-of-3 to 3-of-3. Watch the first opcode, hash, and address change.</li><li>Swap two public keys. The key order is part of the script.</li><li>Switch networks. The redeem script and its hash stay the same; the version, checksum, and address change.</li></ul></div>
        </section>}
        {definition.summary && <section className="locking-card panel" aria-label="Output and spending">
          <div className="locking-heading"><span className="section-index">03</span><h2>Connect the address to its output</h2></div>
          <p className="lesson-summary">{definition.summary}</p>
          {ready && runtime.trace?.outputScript ? <>
            <ByteExplorer key={kind + runtime.trace.address} result={runtime.trace.outputScript} />
            {runtime.trace.relatedScripts?.map(({ title, result: related }) => <div className="related-script" key={title}><h3>{title}</h3><ByteExplorer result={related} /></div>)}
            <details className="spend-details"><summary>Python for the output script</summary><pre>{runtime.trace.outputScript.python}</pre><CopyButton label="Copy full Python example" value={runtime.trace.pythonPreamble + '\n\n' + runtime.trace.steps.map((step) => step.python).join('\n\n') + '\n\n' + runtime.trace.outputScript.python + '\nprint(output_script.to_hex())'} /></details>
          </> : <p className="pending-output">Apply valid inputs to inspect the calculated output script.</p>}
          <details className="spend-details"><summary>How is it spent?</summary><p>{definition.spending}</p><p>This lesson constructs addresses and scripts. The spending explanation is conceptual; no signatures or transactions are created.</p></details>
          <div className="experiments"><span className="eyebrow">TRY IT YOURSELF</span><h3>Follow what changes.</h3><ul>{definition.experiments?.map((experiment) => <li key={experiment}>{experiment}</li>)}</ul></div>
        </section>}
        {definition.references.length > 0 && <div className="lesson-sources">Read the specifications: {definition.references.map((bip) => <a key={bip} href={'https://github.com/bitcoin/bips/blob/master/bip-' + String(bip).padStart(4, '0') + '.mediawiki'} target="_blank" rel="noreferrer">BIP {bip}</a>)}</div>}
        </>}
        <footer className="lesson-footer"><span><span className="small-dot" />Real calculations. No magic. Just Bitcoin.</span><a href="https://github.com/karask/python-bitcoin-utils" target="_blank" rel="noreferrer">python-bitcoin-utils <span>0.8.5</span><ArrowUpRight size={12} /></a></footer>
      </main>
    </div>
    {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
  </div>;
}
