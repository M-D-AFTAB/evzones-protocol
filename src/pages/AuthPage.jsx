// src/pages/AuthPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../context/AuthContext';

export default function AuthPage() {
    const [params]      = useSearchParams();
    const navigate      = useNavigate();
    const [tab, setTab] = useState(params.get('tab') === 'signup' ? 'signup' : 'login');
    const [email, setEmail]     = useState('');
    const [password, setPassword] = useState('');
    const [name, setName]       = useState('');
    const [error, setError]     = useState('');
    const [msg, setMsg]         = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setError(''); setMsg('');
    }, [tab]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
        navigate('/studio');
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        const { error } = await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: name } }
        });
        if (error) { setError(error.message); setLoading(false); return; }
        setMsg('Check your email to confirm your account, then log in.');
        setLoading(false);
    };

    return (
        <div className="ap-root">
            <div className="ap-grid-bg" aria-hidden />

            <div className="ap-wrap">
                <div className="ap-card">
                    {/* Logo mark */}
                    <div className="ap-logo">
                        <span className="ap-logo-mark">◈</span>
                        <span className="ap-logo-name">EVZONES PROTOCOL</span>
                    </div>

                    {/* Tab switcher */}
                    <div className="ap-tabs">
                        <button
                            className={`ap-tab ${tab === 'login' ? 'active' : ''}`}
                            onClick={() => setTab('login')}
                        >Log In</button>
                        <button
                            className={`ap-tab ${tab === 'signup' ? 'active' : ''}`}
                            onClick={() => setTab('signup')}
                        >Sign Up</button>
                    </div>

                    {error && <div className="ap-error">⚠ {error}</div>}
                    {msg   && <div className="ap-success">✓ {msg}</div>}

                    {tab === 'login' ? (
                        <form className="ap-form" onSubmit={handleLogin}>
                            <div className="ap-field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="you@domain.com"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="ap-field">
                                <label>Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <button type="submit" className="ap-submit" disabled={loading}>
                                {loading ? 'AUTHENTICATING…' : 'LOG IN →'}
                            </button>
                            <p className="ap-switch">
                                No account?{' '}
                                <button type="button" onClick={() => setTab('signup')}>Sign up free</button>
                            </p>
                        </form>
                    ) : (
                        <form className="ap-form" onSubmit={handleSignup}>
                            <div className="ap-field">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Your name"
                                    autoFocus
                                />
                            </div>
                            <div className="ap-field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="you@domain.com"
                                    required
                                />
                            </div>
                            <div className="ap-field">
                                <label>Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Min. 8 characters"
                                    minLength={8}
                                    required
                                />
                            </div>
                            <button type="submit" className="ap-submit" disabled={loading}>
                                {loading ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT →'}
                            </button>
                            <p className="ap-switch">
                                Already have an account?{' '}
                                <button type="button" onClick={() => setTab('login')}>Log in</button>
                            </p>
                        </form>
                    )}

                    <p className="ap-terms">
                        By continuing you agree to our Terms of Service and Privacy Policy.
                    </p>
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap');

                .ap-root {
                    min-height: 100vh;
                    background: #040810;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 80px 24px 40px;
                    position: relative;
                    overflow: hidden;
                }
                .ap-grid-bg {
                    position: absolute;
                    inset: 0;
                    background-image:
                        linear-gradient(rgba(0,200,255,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0,200,255,0.04) 1px, transparent 1px);
                    background-size: 48px 48px;
                    mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent);
                }
                .ap-wrap {
                    position: relative;
                    z-index: 1;
                    width: 100%;
                    max-width: 420px;
                }
                .ap-card {
                    background: #080f1c;
                    border: 1px solid rgba(0,200,255,0.15);
                    border-radius: 8px;
                    padding: 40px;
                    box-shadow:
                        0 0 0 1px rgba(0,200,255,0.05),
                        0 40px 80px rgba(0,0,0,0.6),
                        inset 0 1px 0 rgba(0,200,255,0.1);
                    animation: cardIn .4s ease both;
                }
                @keyframes cardIn {
                    from { opacity: 0; transform: translateY(16px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .ap-logo {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 32px;
                    justify-content: center;
                }
                .ap-logo-mark {
                    font-size: 1.5rem;
                    color: #00c8ff;
                    filter: drop-shadow(0 0 10px #00c8ff);
                }
                .ap-logo-name {
                    font-family: 'Space Mono', monospace;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #fff;
                    letter-spacing: 3px;
                }
                .ap-tabs {
                    display: flex;
                    border: 1px solid rgba(0,200,255,0.12);
                    border-radius: 6px;
                    padding: 3px;
                    margin-bottom: 28px;
                    gap: 3px;
                }
                .ap-tab {
                    flex: 1;
                    background: none;
                    border: none;
                    color: rgba(220,240,255,0.5);
                    font-family: 'Syne', sans-serif;
                    font-size: 0.85rem;
                    font-weight: 600;
                    padding: 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all .2s;
                }
                .ap-tab.active {
                    background: rgba(0,200,255,0.12);
                    color: #00c8ff;
                }
                .ap-error {
                    background: rgba(255,51,85,0.08);
                    border: 1px solid rgba(255,51,85,0.25);
                    color: #ff3355;
                    font-family: 'Space Mono', monospace;
                    font-size: 0.75rem;
                    padding: 10px 14px;
                    border-radius: 4px;
                    margin-bottom: 20px;
                }
                .ap-success {
                    background: rgba(0,255,136,0.06);
                    border: 1px solid rgba(0,255,136,0.2);
                    color: #00ff88;
                    font-family: 'Space Mono', monospace;
                    font-size: 0.75rem;
                    padding: 10px 14px;
                    border-radius: 4px;
                    margin-bottom: 20px;
                }
                .ap-form { display: flex; flex-direction: column; gap: 18px; }
                .ap-field { display: flex; flex-direction: column; gap: 7px; }
                .ap-field label {
                    font-family: 'Space Mono', monospace;
                    font-size: 0.68rem;
                    color: rgba(180,220,255,0.5);
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                }
                .ap-field input {
                    background: rgba(0,200,255,0.03);
                    border: 1px solid rgba(0,200,255,0.12);
                    border-radius: 5px;
                    padding: 13px 14px;
                    color: #fff;
                    font-family: 'Syne', sans-serif;
                    font-size: 0.9rem;
                    outline: none;
                    transition: border-color .2s, box-shadow .2s;
                }
                .ap-field input:focus {
                    border-color: rgba(0,200,255,0.4);
                    box-shadow: 0 0 0 3px rgba(0,200,255,0.08);
                }
                .ap-field input::placeholder { color: rgba(180,220,255,0.25); }
                .ap-submit {
                    background: #00c8ff;
                    color: #000;
                    border: none;
                    padding: 14px;
                    border-radius: 5px;
                    font-family: 'Space Mono', monospace;
                    font-size: 0.8rem;
                    font-weight: 700;
                    letter-spacing: 2px;
                    cursor: pointer;
                    transition: all .2s;
                    margin-top: 4px;
                }
                .ap-submit:hover:not(:disabled) {
                    background: #fff;
                    box-shadow: 0 0 30px rgba(0,200,255,0.4);
                }
                .ap-submit:disabled {
                    opacity: .5; cursor: not-allowed;
                }
                .ap-switch {
                    text-align: center;
                    font-family: 'Syne', sans-serif;
                    font-size: 0.8rem;
                    color: rgba(180,220,255,0.4);
                    margin-top: 4px;
                }
                .ap-switch button {
                    background: none;
                    border: none;
                    color: #00c8ff;
                    cursor: pointer;
                    font-size: 0.8rem;
                    font-family: inherit;
                    text-decoration: underline;
                    padding: 0;
                }
                .ap-terms {
                    text-align: center;
                    font-family: 'Syne', sans-serif;
                    font-size: 0.7rem;
                    color: rgba(180,220,255,0.25);
                    margin-top: 24px;
                    line-height: 1.6;
                }
            `}</style>
        </div>
    );
}