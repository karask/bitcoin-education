import { ArrowRight, Blocks, Fingerprint, FlaskConical, Code2, Network, KeyRound, MousePointer2, Play, ScanLine, Scale, Sparkles } from 'lucide-react';
import './home.css';

export function HomeScreen() {
  return <div className="lab-home">
    <section className="home-welcome" aria-labelledby="home-title">
      <div className="home-eyebrow"><FlaskConical size={15} />WELCOME TO YOUR BITCOIN LAB</div>
      <h1 id="home-title">Big ideas.<br /><span>Tiny bytes.</span></h1>
      <p>Bitcoin makes more sense when you can play with it. Change an input, follow the bytes, and discover what makes it work.</p>
      <div className="home-invitation"><Sparkles size={15} /><span>Bring your curiosity. We’ll bring the examples.</span></div>
      <div className="home-byte-confetti" aria-hidden="true"><span>01</span><span>₿</span><span>ff</span><span>00</span></div>
    </section>

    <div className="home-path-heading"><h2>Pick your first adventure</h2><span>Four ways in. Plenty of “aha!” moments.</span></div>
    <section className="home-paths" aria-label="Choose a learning path">
      <a className="home-path home-addresses" href="#p2pkh" aria-labelledby="home-address-title">
        <div className="home-path-top"><span className="home-path-icon"><Fingerprint size={24} /></span><span className="home-path-tag">ADDRESSES</span><ArrowRight className="home-card-arrow" size={19} /></div>
        <h3 id="home-address-title">Where do the coins go?</h3>
        <p>Turn keys and spending rules into Bitcoin addresses. Explore the hashes, scripts, and checksums hiding behind those familiar characters.</p>
        <div className="home-mini-path" aria-hidden="true"><span><KeyRound size={14} />Key</span><ArrowRight size={13} /><span>Hash</span><ArrowRight size={13} /><span>Address</span></div>
        <div className="home-path-cta">Make an address<ArrowRight size={16} /></div>
      </a>
      <a className="home-path home-transactions" href="#coins" aria-labelledby="home-transaction-title">
        <div className="home-path-top"><span className="home-path-icon"><Blocks size={24} /></span><span className="home-path-tag">TRANSACTIONS</span><ArrowRight className="home-card-arrow" size={19} /></div>
        <h3 id="home-transaction-title">How do the coins move?</h3>
        <p>Choose coins, build a payment, and sign it. Explore how inputs affect fees and change, then inspect the bytes and compare spending types.</p>
        <div className="home-mini-path" aria-hidden="true"><span>Choose</span><ArrowRight size={13} /><span>Build</span><ArrowRight size={13} /><span>Sign</span></div>
        <div className="home-path-cta">Choose your coins<ArrowRight size={16} /></div>
      </a>
      <a className="home-path home-scripts" href="#execution" aria-labelledby="home-script-title">
        <div className="home-path-top"><span className="home-path-icon"><Code2 size={24} /></span><span className="home-path-tag">SCRIPTS & TIMELOCKS</span><ArrowRight className="home-card-arrow" size={19} /></div>
        <h3 id="home-script-title">What unlocks the coins?</h3>
        <p>Follow spending scripts through the stack. Test signatures and spending conditions, then change an argument to see why a spend passes or fails.</p>
        <div className="home-mini-path" aria-hidden="true"><span>Script</span><ArrowRight size={13} /><span>Stack</span><ArrowRight size={13} /><span>Result</span></div>
        <div className="home-path-cta">Run a spending script<ArrowRight size={16} /></div>
      </a>
      <a className="home-path home-network" href="#blocks" aria-labelledby="home-network-title">
        <div className="home-path-top"><span className="home-path-icon"><Network size={24} /></span><span className="home-path-tag">NETWORK & BLOCKS</span><ArrowRight className="home-card-arrow" size={19} /></div>
        <h3 id="home-network-title">How does everyone agree?</h3>
        <p>Explore modeled mempools and block relay. Select transactions, build a Merkle root, try mining, and watch confirmations grow.</p>
        <div className="home-mini-path" aria-hidden="true"><span>Relay</span><ArrowRight size={13} /><span>Mine</span><ArrowRight size={13} /><span>Confirm</span></div>
        <div className="home-path-cta">Follow a block<ArrowRight size={16} /></div>
      </a>
    </section>

    <a className="home-comparison" href="#tx-compare"><Scale size={24} /><div><strong>Same payment. Different footprints.</strong><span>Compare transaction types, weigh their bytes, and try your own fee rate.</span></div><span className="home-comparison-cta">Try the comparison lab<ArrowRight size={16} /></span></a>
    <section className="home-playbook" aria-label="How to explore">
      <div><MousePointer2 size={18} /><p><strong>Change it.</strong><span>Try an input of your own.</span></p></div>
      <div><Play size={18} /><p><strong>Play it.</strong><span>Watch each step unfold.</span></p></div>
      <div><ScanLine size={18} /><p><strong>Inspect it.</strong><span>Find the story in every byte.</span></p></div>
    </section>
    <p className="home-footnote">Start with the examples. Explore at your own pace. No wallet or real coins needed.</p>
  </div>;
}
