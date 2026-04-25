// src/components/Navbar.jsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
    const { user, signOut } = useAuth();
    const location          = useLocation();
    const navigate          = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenu]     = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Close menu on route change
    useEffect(() => { setMenu(false); }, [location.pathname]);

    const handleSignOut = async () => {
        await signOut();
        navigate('/');
    };

    const isActive = (path) => location.pathname === path;

    // Scroll to section on homepage
    const scrollTo = (id) => {
        if (location.pathname !== '/') {
            navigate('/#' + id);
            return;
        }
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <>
            <nav className={`ev-nav ${scrolled ? 'scrolled' : ''}`}>
                <div className="ev-nav-inner">
                    {/* Logo */}
                    <Link to="/" className="ev-nav-logo">
                        <span className="ev-logo-mark">◈</span>
                        <span className="ev-logo-text">EVZONES</span>
                    </Link>

                    {/* Desktop links */}
                    <div className="ev-nav-links">
                        {!user ? (
                            // Public nav
                            <>
                                <button className="ev-nav-link" onClick={() => scrollTo('about')}>About</button>
                                <button className="ev-nav-link" onClick={() => scrollTo('how-it-works')}>How It Works</button>
                                <button className="ev-nav-link" onClick={() => scrollTo('pricing')}>Pricing</button>
                                <button className="ev-nav-link" onClick={() => scrollTo('contact')}>Contact</button>
                                <div className="ev-nav-divider" />
                                <Link to="/auth" className="ev-nav-link">Log In</Link>
                                <Link to="/auth?tab=signup" className="ev-nav-cta">Get Started</Link>
                            </>
                        ) : (
                            // Authenticated nav
                            <>
                                <Link to="/studio"    className={`ev-nav-link ${isActive('/studio')    ? 'active' : ''}`}>Studio</Link>
                                <Link to="/dashboard" className={`ev-nav-link ${isActive('/dashboard') ? 'active' : ''}`}>Dashboard</Link>
                                <button className="ev-nav-link" onClick={() => scrollTo('contact')}>Contact</button>
                                <div className="ev-nav-divider" />
                                <div className="ev-user-pill">
                                    <span className="ev-user-dot" />
                                    <span className="ev-user-email">{user.email?.split('@')[0]}</span>
                                </div>
                                <button className="ev-nav-signout" onClick={handleSignOut}>Sign Out</button>
                            </>
                        )}
                    </div>

                    {/* Mobile hamburger */}
                    <button className="ev-hamburger" onClick={() => setMenu(!menuOpen)} aria-label="Menu">
                        <span className={menuOpen ? 'open' : ''} />
                        <span className={menuOpen ? 'open' : ''} />
                        <span className={menuOpen ? 'open' : ''} />
                    </button>
                </div>

                {/* Mobile menu */}
                {menuOpen && (
                    <div className="ev-mobile-menu">
                        {!user ? (
                            <>
                                <button onClick={() => scrollTo('about')}>About</button>
                                <button onClick={() => scrollTo('how-it-works')}>How It Works</button>
                                <button onClick={() => scrollTo('pricing')}>Pricing</button>
                                <button onClick={() => scrollTo('contact')}>Contact</button>
                                <Link to="/auth">Log In</Link>
                                <Link to="/auth?tab=signup" className="mobile-cta">Get Started →</Link>
                            </>
                        ) : (
                            <>
                                <Link to="/studio">Studio</Link>
                                <Link to="/dashboard">Dashboard</Link>
                                <button onClick={() => scrollTo('contact')}>Contact</button>
                                <button onClick={handleSignOut} className="mobile-signout">Sign Out</button>
                            </>
                        )}
                    </div>
                )}
            </nav>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@500;700;800&display=swap');

                .ev-nav {
                    position: fixed;
                    top: 0; left: 0; right: 0;
                    z-index: 1000;
                    transition: background .3s, border-color .3s, backdrop-filter .3s;
                    border-bottom: 1px solid transparent;
                }
                .ev-nav.scrolled {
                    background: rgba(4,8,16,0.92);
                    backdrop-filter: blur(12px);
                    border-color: rgba(0,200,255,0.1);
                }
                .ev-nav-inner {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 0 24px;
                    height: 64px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .ev-nav-logo {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    text-decoration: none;
                }
                .ev-logo-mark {
                    font-size: 1.3rem;
                    color: #00c8ff;
                    filter: drop-shadow(0 0 8px #00c8ff);
                }
                .ev-logo-text {
                    font-family: 'Space Mono', monospace;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #fff;
                    letter-spacing: 3px;
                }
                .ev-nav-links {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .ev-nav-link {
                    background: none;
                    border: none;
                    color: rgba(220,240,255,0.6);
                    font-family: 'Syne', sans-serif;
                    font-size: 0.85rem;
                    font-weight: 500;
                    padding: 8px 14px;
                    cursor: pointer;
                    border-radius: 4px;
                    text-decoration: none;
                    transition: color .2s, background .2s;
                    display: inline-flex;
                    align-items: center;
                }
                .ev-nav-link:hover, .ev-nav-link.active {
                    color: #fff;
                    background: rgba(255,255,255,0.05);
                }
                .ev-nav-link.active {
                    color: #00c8ff;
                }
                .ev-nav-divider {
                    width: 1px;
                    height: 20px;
                    background: rgba(255,255,255,0.1);
                    margin: 0 8px;
                }
                .ev-nav-cta {
                    background: #00c8ff;
                    color: #000;
                    font-family: 'Syne', sans-serif;
                    font-size: 0.8rem;
                    font-weight: 700;
                    padding: 9px 18px;
                    border-radius: 4px;
                    text-decoration: none;
                    letter-spacing: 0.5px;
                    transition: all .2s;
                    margin-left: 4px;
                }
                .ev-nav-cta:hover {
                    background: #fff;
                    box-shadow: 0 0 20px rgba(0,200,255,0.4);
                }
                .ev-user-pill {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    background: rgba(0,200,255,0.06);
                    border: 1px solid rgba(0,200,255,0.15);
                    padding: 6px 12px;
                    border-radius: 20px;
                }
                .ev-user-dot {
                    width: 6px; height: 6px;
                    border-radius: 50%;
                    background: #00ff88;
                    box-shadow: 0 0 6px #00ff88;
                }
                .ev-user-email {
                    font-family: 'Space Mono', monospace;
                    font-size: 0.72rem;
                    color: rgba(220,240,255,0.8);
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .ev-nav-signout {
                    background: none;
                    border: 1px solid rgba(255,51,85,0.3);
                    color: rgba(255,51,85,0.7);
                    font-family: 'Syne', sans-serif;
                    font-size: 0.78rem;
                    padding: 7px 14px;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all .2s;
                    margin-left: 4px;
                }
                .ev-nav-signout:hover {
                    background: rgba(255,51,85,0.08);
                    color: #ff3355;
                    border-color: #ff3355;
                }

                /* Hamburger */
                .ev-hamburger {
                    display: none;
                    flex-direction: column;
                    gap: 5px;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                }
                .ev-hamburger span {
                    display: block;
                    width: 22px; height: 2px;
                    background: rgba(220,240,255,0.7);
                    border-radius: 2px;
                    transition: all .3s;
                }
                .ev-hamburger span.open:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
                .ev-hamburger span.open:nth-child(2) { opacity: 0; }
                .ev-hamburger span.open:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }

                /* Mobile menu */
                .ev-mobile-menu {
                    background: rgba(4,8,16,0.98);
                    border-top: 1px solid rgba(0,200,255,0.1);
                    padding: 16px 24px 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .ev-mobile-menu a,
                .ev-mobile-menu button {
                    background: none;
                    border: none;
                    color: rgba(220,240,255,0.7);
                    font-family: 'Syne', sans-serif;
                    font-size: 1rem;
                    padding: 12px 0;
                    cursor: pointer;
                    text-align: left;
                    text-decoration: none;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    transition: color .2s;
                }
                .ev-mobile-menu a:hover, .ev-mobile-menu button:hover { color: #fff; }
                .ev-mobile-menu .mobile-cta { color: #00c8ff; font-weight: 700; border-bottom: none; }
                .ev-mobile-menu .mobile-signout { color: rgba(255,51,85,0.7); border-bottom: none; }

                @media (max-width: 768px) {
                    .ev-nav-links { display: none; }
                    .ev-hamburger { display: flex; }
                }
            `}</style>
        </>
    );
}