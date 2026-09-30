import { ArrowRight, Blocks, Fingerprint, FlaskConical, KeyRound, MousePointer2, Play, ScanLine, Sparkles } from 'lucide-react';
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

    <div className="home-path-heading"><h2>Pick your first adventure</h2><span>Two ways in. Plenty of “aha!” moments.</span></div>
    <section className="home-paths" aria-label="Choose a learning path">
      <a className="home-path home-addresses" href="#p2pkh" aria-labelledby="home-address-title">
        <div className="home-path-top"><span className="home-path-icon"><Fingerprint size={24} /></span><span className="home-path-tag">ADDRESSES</span><ArrowRight className="home-card-arrow" size={19} /></div>
        <h3 id="home-address-title">Where do the coins go?</h3>
        <p>Turn keys and spending rules into Bitcoin addresses. Explore the hashes, scripts, and checksums hiding behind those familiar characters.</p>
        <div className="home-mini-path" aria-hidden="true"><span><KeyRound size={14} />Key</span><ArrowRight size={13} /><span>Hash</span><ArrowRight size={13} /><span>Address</span></div>
        <div className="home-path-cta">Make an address<ArrowRight size={16} /></div>
      </a>
      <a className="home-path home-transactions" href="#transaction" aria-labelledby="home-transaction-title">
        <div className="home-path-top"><span className="home-path-icon"><Blocks size={24} /></span><span className="home-path-tag">TRANSACTIONS</span><ArrowRight className="home-card-arrow" size={19} /></div>
        <h3 id="home-transaction-title">How do the coins move?</h3>
        <p>Build and sign a transaction, test its spending rules, and follow it through modeled mempools, mining, and confirmations.</p>
        <div className="home-mini-path" aria-hidden="true"><span>Build</span><ArrowRight size={13} /><span>Sign</span><ArrowRight size={13} /><span>Confirm</span></div>
        <div className="home-path-cta">Follow a transaction<ArrowRight size={16} /></div>
      </a>
    </section>

    <section className="home-playbook" aria-label="How to explore">
      <div><MousePointer2 size={18} /><p><strong>Change it.</strong><span>Try an input of your own.</span></p></div>
      <div><Play size={18} /><p><strong>Play it.</strong><span>Watch each step unfold.</span></p></div>
      <div><ScanLine size={18} /><p><strong>Inspect it.</strong><span>Find the story in every byte.</span></p></div>
    </section>
    <p className="home-footnote">Start with the examples. Explore at your own pace. No wallet or real coins needed.</p>
  </div>;
}
