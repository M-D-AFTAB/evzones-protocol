// src/pages/HomePage.jsx
import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// Animated counter hook
function useCounter(target, duration = 1500) {
    const [count, setCount] = React.useState(0);
    const ref = useRef(false);
    useEffect(() => {
        if (ref.current) return;
        ref.current = true;
        const start = Date.now();
        const tick = () => {
            const p = Math.min((Date.now() - start) / duration, 1);
            setCount(Math.floor(p * p * target));
            if (p < 1) requestAnimationFrame(tick);
            else setCount(target);
        };
        requestAnimationFrame(tick);
    }, [target, duration]);
    return count;
}

function StatCounter({ value, label, suffix = '' }) {
    const count = useCounter(value);
    return (
        <div className="hp-stat">
            <div className="hp-stat-val">{count.toLocaleString()}{suffix}</div>
            <div className="hp-stat-label">{label}</div>
        </div>
    );
}

export default function HomePage() {
    return (
        <div className="hp-root">
            <div className="hp-grain" aria-hidden />

            {/* ── Hero ─────────────────────────────────────────────────── */}
            <section className="hp-hero">
                <div className="hp-hero-grid" aria-hidden />
                <div className="hp-hero-glow" aria-hidden />

                <div className="hp-hero-inner">
                    <div className="hp-hero-badge">
                        <span className="hp-badge-dot" />
                        MILITARY-GRADE VIDEO DRM
                    </div>

                    <h1 className="hp-hero-title">
                        Your video.<br />
                        <span className="hp-title-accent">Untouchable.</span><br />
                        <span className="hp-title-dim">Everywhere.</span>
                    </h1>

                    <p className="hp-hero-desc">
                        Evzones Protocol transforms passive video files into active, self-defending
                        assets. Encrypted in your browser. Vault-locked. Impossible to extract —
                        even from the network tab.
                    </p>

                    <div className="hp-hero-actions">
                        <Link to="/auth?tab=signup" className="hp-btn-primary">
                            Start Protecting — Free →
                        </Link>
                        <button
                            className="hp-btn-ghost"
                            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                        >
                            See How It Works
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="hp-stats">
                        <StatCounter value={10}   label="GB MAX FILE SIZE"     suffix="GB" />
                        <div className="hp-stat-sep" />
                        <StatCounter value={256}  label="AES ENCRYPTION BITS"  suffix="-bit" />
                        <div className="hp-stat-sep" />
                        <StatCounter value={0}    label="SERVER STORAGE COST"  suffix="$" />
                        <div className="hp-stat-sep" />
                        <StatCounter value={100}  label="% BROWSER PROCESSED"  suffix="%" />
                    </div>
                </div>

                {/* Decorative terminal */}
                <div className="hp-terminal" aria-hidden>
                    <div className="hp-terminal-bar">
                        <span /><span /><span />
                        <code>evzones_engine.js</code>
                    </div>
                    <div className="hp-terminal-body">
                        <div className="hp-tl"><span className="hp-tl-dim">01</span> <span className="hp-tl-key">const</span> brain = <span className="hp-tl-str">vault</span>.unlock(assetID)</div>
                        <div className="hp-tl"><span className="hp-tl-dim">02</span> <span className="hp-tl-key">const</span> keys = decrypt(brain, RSA_key)</div>
                        <div className="hp-tl"><span className="hp-tl-dim">03</span> <span className="hp-tl-key">const</span> video = AES_CTR(brick, keys)</div>
                        <div className="hp-tl"><span className="hp-tl-dim">04</span> MediaSource.appendBuffer(video)</div>
                        <div className="hp-tl hp-tl-comment"><span className="hp-tl-dim">05</span> // network tab: only opaque ciphertext</div>
                        <div className="hp-tl hp-tl-success"><span className="hp-tl-dim">06</span> ✓ Playing. Keys never touched the wire.</div>
                    </div>
                </div>
            </section>

            {/* ── How It Works ─────────────────────────────────────────── */}
            <section id="how-it-works" className="hp-section">
                <div className="hp-section-inner">
                    <div className="hp-section-tag">HOW IT WORKS</div>
                    <h2 className="hp-section-title">Three steps. Zero exposure.</h2>

                    <div className="hp-steps">
                        {[
                            {
                                num: '01',
                                icon: '📁',
                                title: 'Upload & Process',
                                desc: 'Your video is fragmented entirely in your browser using FFmpeg.wasm. The media data never leaves your device unencrypted.'
                            },
                            {
                                num: '02',
                                icon: '🔑',
                                title: 'Lobotomize & Vault',
                                desc: 'The init segment (the "Brain") is separated and stored encrypted in our vault. The video body (the "Brick") is AES-encrypted with unique per-segment keys.'
                            },
                            {
                                num: '03',
                                icon: '🛡️',
                                title: 'Distribute & Control',
                                desc: 'Download your self-protecting HTML asset. Only whitelisted domains can play it. Kill playback worldwide with one click, instantly.'
                            }
                        ].map(step => (
                            <div key={step.num} className="hp-step">
                                <div className="hp-step-num">{step.num}</div>
                                <div className="hp-step-icon">{step.icon}</div>
                                <h3 className="hp-step-title">{step.title}</h3>
                                <p className="hp-step-desc">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── About ────────────────────────────────────────────────── */}
            <section id="about" className="hp-section hp-section-alt">
                <div className="hp-section-inner hp-about-grid">
                    <div className="hp-about-text">
                        <div className="hp-section-tag">ABOUT</div>
                        <h2 className="hp-section-title">Built for creators who can't afford a leak.</h2>
                        <p className="hp-about-desc">
                            Evzones Protocol was built for sports broadcasters, filmmakers, and
                            enterprise teams distributing sensitive video content. Standard CDN
                            protection is easily bypassed. Our approach is different — the video is
                            cryptographically useless without a real-time handshake with our vault.
                        </p>
                        <p className="hp-about-desc">
                            Every playback requires a fresh RSA key exchange. Every segment is
                            independently encrypted. If a domain gets compromised, one click kills
                            it for every viewer on Earth within 30 seconds.
                        </p>
                        <div className="hp-about-features">
                            {[
                                'Domain whitelist enforcement',
                                'Per-segment AES-256 encryption',
                                'RSA-OAEP key transport — nothing in plaintext',
                                'Instant global kill switch',
                                'Live viewer tracking with playhead positions',
                                'Email alerts on unauthorized access attempts',
                            ].map(f => (
                                <div key={f} className="hp-feature-item">
                                    <span className="hp-feature-check">✓</span>
                                    {f}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="hp-about-visual">
                        <div className="hp-shield-ring">
                            <div className="hp-shield-inner">◈</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Pricing ──────────────────────────────────────────────── */}
            <section id="pricing" className="hp-section">
                <div className="hp-section-inner">
                    <div className="hp-section-tag">PRICING</div>
                    <h2 className="hp-section-title">Simple. Transparent.</h2>

                    <div className="hp-pricing-grid">
                        {[
                            {
                                name: 'Free',
                                price: '$0',
                                period: 'forever',
                                features: ['Up to 500MB per asset', '5 protected assets', 'Domain whitelist', 'Kill switch', 'Basic analytics'],
                                cta: 'Start Free',
                                href: '/auth?tab=signup',
                                highlight: false
                            },
                            {
                                name: 'Pro',
                                price: '$29',
                                period: 'per month',
                                features: ['Up to 10GB per asset', 'Unlimited assets', 'Live playhead tracking', 'World map viewer data', 'Email security alerts', 'Priority support'],
                                cta: 'Start Pro Trial',
                                href: '/auth?tab=signup',
                                highlight: true
                            },
                            {
                                name: 'Enterprise',
                                price: 'Custom',
                                period: 'contact us',
                                features: ['Unlimited everything', 'Custom domains', 'SSO / SAML', 'SLA guarantee', 'Dedicated infrastructure', 'Admin panel'],
                                cta: 'Contact Sales',
                                href: '#contact',
                                highlight: false
                            }
                        ].map(plan => (
                            <div key={plan.name} className={`hp-plan ${plan.highlight ? 'highlight' : ''}`}>
                                {plan.highlight && <div className="hp-plan-badge">MOST POPULAR</div>}
                                <div className="hp-plan-name">{plan.name}</div>
                                <div className="hp-plan-price">
                                    <span className="hp-plan-amount">{plan.price}</span>
                                    <span className="hp-plan-period">/{plan.period}</span>
                                </div>
                                <ul className="hp-plan-features">
                                    {plan.features.map(f => (
                                        <li key={f}><span>✓</span>{f}</li>
                                    ))}
                                </ul>
                                <Link to={plan.href} className={`hp-plan-cta ${plan.highlight ? 'primary' : ''}`}>
                                    {plan.cta}
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Contact ──────────────────────────────────────────────── */}
            <section id="contact" className="hp-section hp-section-alt">
                <div className="hp-section-inner hp-contact-wrap">
                    <div className="hp-section-tag">CONTACT</div>
                    <h2 className="hp-section-title">Get in touch.</h2>
                    <p className="hp-contact-desc">
                        Questions about enterprise licensing, custom integrations, or security audits?
                        We respond within 24 hours.
                    </p>
                    <form className="hp-contact-form" onSubmit={e => { e.preventDefault(); alert('Message sent! We\'ll be in touch soon.'); }}>
                        <div className="hp-cf-row">
                            <div className="hp-cf-field">
                                <label>Name</label>
                                <input type="text" placeholder="Your name" required />
                            </div>
                            <div className="hp-cf-field">
                                <label>Email</label>
                                <input type="email" placeholder="you@domain.com" required />
                            </div>
                        </div>
                        <div className="hp-cf-field">
                            <label>Message</label>
                            <textarea placeholder="Tell us what you're building..." rows={5} required />
                        </div>
                        <button type="submit" className="hp-cf-submit">SEND MESSAGE →</button>
                    </form>
                </div>
            </section>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <footer className="hp-footer">
                <div className="hp-footer-inner">
                    <div className="hp-footer-logo">
                        <span className="hp-footer-mark">◈</span>
                        <span>EVZONES PROTOCOL</span>
                    </div>
                    <div className="hp-footer-links">
                        <a href="#about">About</a>
                        <a href="#how-it-works">How It Works</a>
                        <a href="#pricing">Pricing</a>
                        <a href="#contact">Contact</a>
                        <Link to="/auth">Log In</Link>
                    </div>
                    <div className="hp-footer-copy">
                        © {new Date().getFullYear()} Evzones Protocol. All rights reserved.
                    </div>
                </div>
            </footer>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');

                :root {
                    --bg:     #040810;
                    --panel:  #080f1c;
                    --cyan:   #00c8ff;
                    --green:  #00ff88;
                    --muted:  rgba(180,220,255,0.5);
                    --text:   rgba(220,240,255,0.9);
                    --mono:   'Space Mono', monospace;
                    --sans:   'Syne', sans-serif;
                }

                .hp-root {
                    background: var(--bg);
                    color: var(--text);
                    font-family: var(--sans);
                    overflow-x: hidden;
                    position: relative;
                }
                .hp-grain {
                    position: fixed;
                    inset: 0;
                    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
                    pointer-events: none;
                    z-index: 0;
                    opacity: .4;
                }

                /* ── Hero ───────────────────────────────────────────────── */
                .hp-hero {
                    min-height: 100vh;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    align-items: center;
                    gap: 60px;
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 120px 24px 80px;
                    position: relative;
                }
                .hp-hero-grid {
                    position: absolute;
                    inset: 0;
                    background-image:
                        linear-gradient(rgba(0,200,255,0.05) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0,200,255,0.05) 1px, transparent 1px);
                    background-size: 60px 60px;
                    mask-image: radial-gradient(ellipse 70% 70% at 30% 50%, black, transparent);
                }
                .hp-hero-glow {
                    position: absolute;
                    top: 20%; left: -10%;
                    width: 600px; height: 600px;
                    background: radial-gradient(ellipse, rgba(0,200,255,0.06) 0%, transparent 70%);
                    pointer-events: none;
                }
                .hp-hero-inner {
                    position: relative;
                    z-index: 1;
                    animation: fadeUp .8s ease both;
                }
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(24px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .hp-hero-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    font-family: var(--mono);
                    font-size: 0.65rem;
                    letter-spacing: 2px;
                    color: var(--cyan);
                    background: rgba(0,200,255,0.06);
                    border: 1px solid rgba(0,200,255,0.2);
                    padding: 7px 14px;
                    border-radius: 20px;
                    margin-bottom: 28px;
                }
                .hp-badge-dot {
                    width: 6px; height: 6px;
                    border-radius: 50%;
                    background: var(--cyan);
                    box-shadow: 0 0 8px var(--cyan);
                    animation: blink 2s ease-in-out infinite;
                }
                @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
                .hp-hero-title {
                    font-size: clamp(2.5rem, 5vw, 4rem);
                    font-weight: 800;
                    line-height: 1.1;
                    margin: 0 0 24px;
                    color: #fff;
                }
                .hp-title-accent {
                    color: var(--cyan);
                    text-shadow: 0 0 40px rgba(0,200,255,0.4);
                }
                .hp-title-dim { color: rgba(255,255,255,0.35); }
                .hp-hero-desc {
                    font-size: 1.05rem;
                    line-height: 1.7;
                    color: var(--muted);
                    max-width: 480px;
                    margin-bottom: 36px;
                }
                .hp-hero-actions {
                    display: flex;
                    gap: 14px;
                    flex-wrap: wrap;
                    margin-bottom: 52px;
                }
                .hp-btn-primary {
                    background: var(--cyan);
                    color: #000;
                    font-family: var(--sans);
                    font-size: 0.9rem;
                    font-weight: 700;
                    padding: 14px 28px;
                    border-radius: 6px;
                    text-decoration: none;
                    transition: all .2s;
                    display: inline-block;
                }
                .hp-btn-primary:hover {
                    background: #fff;
                    box-shadow: 0 0 40px rgba(0,200,255,0.4);
                    transform: translateY(-1px);
                }
                .hp-btn-ghost {
                    background: none;
                    border: 1px solid rgba(255,255,255,0.15);
                    color: rgba(220,240,255,0.7);
                    font-family: var(--sans);
                    font-size: 0.9rem;
                    font-weight: 600;
                    padding: 14px 28px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all .2s;
                }
                .hp-btn-ghost:hover {
                    border-color: rgba(255,255,255,0.3);
                    color: #fff;
                    background: rgba(255,255,255,0.04);
                }
                .hp-stats {
                    display: flex;
                    align-items: center;
                    gap: 0;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .hp-stat { text-align: center; padding: 0 20px; }
                .hp-stat:first-child { padding-left: 0; }
                .hp-stat-val {
                    font-family: var(--mono);
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--cyan);
                }
                .hp-stat-label {
                    font-family: var(--mono);
                    font-size: 0.55rem;
                    color: var(--muted);
                    letter-spacing: 1.5px;
                    margin-top: 4px;
                }
                .hp-stat-sep {
                    width: 1px; height: 32px;
                    background: rgba(0,200,255,0.15);
                }

                /* Terminal */
                .hp-terminal {
                    position: relative;
                    z-index: 1;
                    background: #060d1a;
                    border: 1px solid rgba(0,200,255,0.15);
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow:
                        0 0 0 1px rgba(0,200,255,0.05),
                        0 40px 80px rgba(0,0,0,0.5),
                        inset 0 1px 0 rgba(0,200,255,0.1);
                    animation: fadeUp .8s .2s ease both;
                }
                .hp-terminal-bar {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 12px 16px;
                    background: rgba(0,200,255,0.04);
                    border-bottom: 1px solid rgba(0,200,255,0.1);
                }
                .hp-terminal-bar span {
                    width: 10px; height: 10px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.1);
                }
                .hp-terminal-bar code {
                    font-family: var(--mono);
                    font-size: 0.7rem;
                    color: var(--muted);
                    margin-left: 8px;
                }
                .hp-terminal-body {
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .hp-tl {
                    font-family: var(--mono);
                    font-size: 0.78rem;
                    color: rgba(220,240,255,0.7);
                    display: flex;
                    gap: 12px;
                }
                .hp-tl-dim { color: rgba(180,220,255,0.25); flex-shrink: 0; }
                .hp-tl-key { color: var(--cyan); }
                .hp-tl-str { color: #00ff88; }
                .hp-tl-comment { color: rgba(180,220,255,0.3); }
                .hp-tl-success { color: var(--green); }

                /* ── Sections ─────────────────────────────────────────── */
                .hp-section { padding: 100px 0; }
                .hp-section-alt { background: rgba(8,15,28,0.6); }
                .hp-section-inner {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 0 24px;
                }
                .hp-section-tag {
                    font-family: var(--mono);
                    font-size: 0.65rem;
                    letter-spacing: 3px;
                    color: var(--cyan);
                    margin-bottom: 16px;
                }
                .hp-section-title {
                    font-size: clamp(1.8rem, 3.5vw, 2.6rem);
                    font-weight: 800;
                    color: #fff;
                    margin: 0 0 48px;
                    line-height: 1.2;
                }

                /* Steps */
                .hp-steps {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 24px;
                }
                .hp-step {
                    background: var(--panel);
                    border: 1px solid rgba(0,200,255,0.08);
                    border-radius: 8px;
                    padding: 32px;
                    position: relative;
                    transition: border-color .2s, transform .2s;
                }
                .hp-step:hover {
                    border-color: rgba(0,200,255,0.2);
                    transform: translateY(-2px);
                }
                .hp-step-num {
                    font-family: var(--mono);
                    font-size: 0.7rem;
                    color: var(--cyan);
                    opacity: .6;
                    margin-bottom: 16px;
                }
                .hp-step-icon { font-size: 2rem; margin-bottom: 16px; }
                .hp-step-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 12px;
                }
                .hp-step-desc {
                    font-size: 0.88rem;
                    color: var(--muted);
                    line-height: 1.7;
                }

                /* About */
                .hp-about-grid {
                    display: grid;
                    grid-template-columns: 1fr 380px;
                    gap: 80px;
                    align-items: center;
                }
                .hp-about-desc {
                    font-size: 0.95rem;
                    color: var(--muted);
                    line-height: 1.8;
                    margin-bottom: 20px;
                }
                .hp-about-features {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-top: 32px;
                }
                .hp-feature-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 0.88rem;
                    color: rgba(220,240,255,0.7);
                }
                .hp-feature-check {
                    color: var(--green);
                    font-family: var(--mono);
                    flex-shrink: 0;
                }
                .hp-shield-ring {
                    width: 280px; height: 280px;
                    border: 1px solid rgba(0,200,255,0.15);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    margin: 0 auto;
                    animation: rotate 20s linear infinite;
                }
                .hp-shield-ring::before {
                    content: '';
                    position: absolute;
                    inset: 20px;
                    border: 1px solid rgba(0,200,255,0.08);
                    border-radius: 50%;
                }
                @keyframes rotate { to { transform: rotate(360deg); } }
                .hp-shield-inner {
                    font-size: 4rem;
                    color: var(--cyan);
                    filter: drop-shadow(0 0 30px var(--cyan));
                    animation: rotate 20s linear reverse infinite;
                }

                /* Pricing */
                .hp-pricing-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 20px;
                    align-items: start;
                }
                .hp-plan {
                    background: var(--panel);
                    border: 1px solid rgba(0,200,255,0.08);
                    border-radius: 8px;
                    padding: 32px;
                    position: relative;
                    transition: border-color .2s;
                }
                .hp-plan.highlight {
                    border-color: rgba(0,200,255,0.3);
                    background: rgba(0,200,255,0.03);
                    box-shadow: 0 0 40px rgba(0,200,255,0.06);
                }
                .hp-plan-badge {
                    position: absolute;
                    top: -12px; left: 50%;
                    transform: translateX(-50%);
                    background: var(--cyan);
                    color: #000;
                    font-family: var(--mono);
                    font-size: 0.6rem;
                    font-weight: 700;
                    letter-spacing: 1.5px;
                    padding: 4px 12px;
                    border-radius: 20px;
                    white-space: nowrap;
                }
                .hp-plan-name {
                    font-family: var(--mono);
                    font-size: 0.7rem;
                    letter-spacing: 2px;
                    color: var(--muted);
                    margin-bottom: 16px;
                }
                .hp-plan-price { margin-bottom: 28px; }
                .hp-plan-amount {
                    font-family: var(--mono);
                    font-size: 2.2rem;
                    font-weight: 700;
                    color: #fff;
                }
                .hp-plan-period {
                    font-size: 0.8rem;
                    color: var(--muted);
                    margin-left: 4px;
                }
                .hp-plan-features {
                    list-style: none;
                    padding: 0;
                    margin: 0 0 28px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .hp-plan-features li {
                    display: flex;
                    gap: 10px;
                    font-size: 0.85rem;
                    color: var(--muted);
                }
                .hp-plan-features li span { color: var(--green); flex-shrink: 0; }
                .hp-plan-cta {
                    display: block;
                    text-align: center;
                    border: 1px solid rgba(0,200,255,0.25);
                    color: var(--cyan);
                    font-family: var(--mono);
                    font-size: 0.75rem;
                    letter-spacing: 1.5px;
                    padding: 12px;
                    border-radius: 4px;
                    text-decoration: none;
                    transition: all .2s;
                }
                .hp-plan-cta:hover { background: rgba(0,200,255,0.08); }
                .hp-plan-cta.primary {
                    background: var(--cyan);
                    color: #000;
                    border-color: var(--cyan);
                    font-weight: 700;
                }
                .hp-plan-cta.primary:hover {
                    background: #fff;
                    border-color: #fff;
                    box-shadow: 0 0 20px rgba(0,200,255,0.3);
                }

                /* Contact */
                .hp-contact-wrap { max-width: 700px; }
                .hp-contact-desc {
                    font-size: 0.95rem;
                    color: var(--muted);
                    line-height: 1.7;
                    margin-bottom: 36px;
                }
                .hp-contact-form { display: flex; flex-direction: column; gap: 16px; }
                .hp-cf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
                .hp-cf-field { display: flex; flex-direction: column; gap: 7px; }
                .hp-cf-field label {
                    font-family: var(--mono);
                    font-size: 0.65rem;
                    color: var(--muted);
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                }
                .hp-cf-field input,
                .hp-cf-field textarea {
                    background: rgba(0,200,255,0.03);
                    border: 1px solid rgba(0,200,255,0.12);
                    border-radius: 5px;
                    padding: 13px 14px;
                    color: #fff;
                    font-family: var(--sans);
                    font-size: 0.9rem;
                    outline: none;
                    resize: vertical;
                    transition: border-color .2s;
                }
                .hp-cf-field input:focus,
                .hp-cf-field textarea:focus { border-color: rgba(0,200,255,0.35); }
                .hp-cf-field input::placeholder,
                .hp-cf-field textarea::placeholder { color: rgba(180,220,255,0.25); }
                .hp-cf-submit {
                    align-self: flex-start;
                    background: var(--cyan);
                    color: #000;
                    border: none;
                    padding: 14px 32px;
                    border-radius: 5px;
                    font-family: var(--mono);
                    font-size: 0.75rem;
                    font-weight: 700;
                    letter-spacing: 2px;
                    cursor: pointer;
                    transition: all .2s;
                }
                .hp-cf-submit:hover {
                    background: #fff;
                    box-shadow: 0 0 30px rgba(0,200,255,0.3);
                }

                /* Footer */
                .hp-footer {
                    border-top: 1px solid rgba(0,200,255,0.08);
                    padding: 40px 0;
                }
                .hp-footer-inner {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 0 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 20px;
                }
                .hp-footer-logo {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-family: var(--mono);
                    font-size: 0.75rem;
                    color: rgba(220,240,255,0.4);
                    letter-spacing: 2px;
                }
                .hp-footer-mark { color: var(--cyan); font-size: 1.1rem; }
                .hp-footer-links {
                    display: flex;
                    gap: 24px;
                    flex-wrap: wrap;
                }
                .hp-footer-links a {
                    font-family: var(--sans);
                    font-size: 0.82rem;
                    color: rgba(180,220,255,0.4);
                    text-decoration: none;
                    transition: color .2s;
                }
                .hp-footer-links a:hover { color: rgba(180,220,255,0.8); }
                .hp-footer-copy {
                    font-family: var(--mono);
                    font-size: 0.65rem;
                    color: rgba(180,220,255,0.25);
                }

                @media (max-width: 900px) {
                    .hp-hero { grid-template-columns: 1fr; }
                    .hp-terminal { display: none; }
                    .hp-steps { grid-template-columns: 1fr; }
                    .hp-about-grid { grid-template-columns: 1fr; }
                    .hp-about-visual { display: none; }
                    .hp-pricing-grid { grid-template-columns: 1fr; }
                    .hp-cf-row { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}