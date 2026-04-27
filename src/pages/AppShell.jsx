// src/pages/AppShell.jsx
// Protected shell — only loaded after Firebase auth is confirmed.
// Contains: theme‑aware nav + Studio and Dashboard as sub‑routes.

import React, { useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import EvzonesStudio from './EvzonesStudio';
import Dashboard from './Dashboard';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '50%',
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: '18px',
        transition: 'var(--transition)',
      }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

export default function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const isActive = (path) => location.pathname === `/app${path}`;

  const navLink = (to, label) => (
    <Link
      to={`/app${to}`}
      onClick={() => setMenuOpen(false)}
      style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        fontWeight: 500,
        color: isActive(to) ? 'var(--accent)' : 'var(--text-secondary)',
        textDecoration: 'none',
        padding: '8px 16px',
        borderRadius: '8px',
        background: isActive(to) ? 'var(--accent-soft)' : 'transparent',
        transition: 'var(--transition)',
      }}
    >
      {label}
    </Link>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '64px',
            gap: '16px',
          }}
        >
          {/* Logo */}
          <Link
            to="/app"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                background: 'var(--accent-soft)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                fontSize: '18px',
                color: 'var(--text-primary)',
                letterSpacing: '-0.3px',
              }}
            >
              Evzones
            </span>
          </Link>

          {/* Desktop nav */}
          <nav style={{ display: 'flex', gap: '4px' }}>
            {navLink('/studio', 'Studio')}
            {navLink('/dashboard', 'Dashboard')}
          </nav>

          {/* User area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-surface)',
                padding: '6px 12px',
                borderRadius: '32px',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                }}
              />
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  maxWidth: '150px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.displayName || user?.email?.split('@')[0]}
              </span>
            </div>
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '32px',
                padding: '7px 16px',
                fontFamily: 'Inter, sans-serif',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Exit
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
              }}
              className="mobile-menu-btn"
            >
              <span
                style={{
                  display: 'block',
                  width: '20px',
                  height: '2px',
                  background: 'var(--text-primary)',
                  margin: '4px 0',
                  transition: 'var(--transition)',
                }}
              />
              <span
                style={{
                  display: 'block',
                  width: '20px',
                  height: '2px',
                  background: 'var(--text-primary)',
                  margin: '4px 0',
                }}
              />
              <span
                style={{
                  display: 'block',
                  width: '20px',
                  height: '2px',
                  background: 'var(--text-primary)',
                  margin: '4px 0',
                }}
              />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div
            style={{
              background: 'var(--bg-primary)',
              borderTop: '1px solid var(--border)',
              padding: '16px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {navLink('/studio', 'Studio')}
            {navLink('/dashboard', 'Dashboard')}
            <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
            <button
              onClick={handleSignOut}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '32px',
                padding: '10px',
                fontFamily: 'Inter, sans-serif',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              Sign Out
            </button>
          </div>
        )}
      </header>

      <Routes>
        <Route path="/" element={<EvzonesStudio />} />
        <Route path="/studio" element={<EvzonesStudio />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>

      <style>
        {`
          @media (max-width: 640px) {
            .mobile-menu-btn {
              display: block !important;
            }
            nav {
              display: none !important;
            }
          }
        `}
      </style>
    </div>
  );
}