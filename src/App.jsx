// src/App.jsx
// Root application router.
//
// SECURITY: Protected pages (Studio, Dashboard) are React.lazy() loaded.
// They are NOT bundled into the initial JS chunk — the browser only requests
// them after auth is confirmed. An unauthenticated visitor never downloads
// or executes the Studio or Dashboard code.
//
// Route structure:
//   /           → HomePage       (public)
//   /auth       → AuthPage       (public, redirects to /studio if already logged in)
//   /studio     → EvzonesStudio  (protected)
//   /dashboard  → Dashboard      (protected)
//
// The Navbar is always rendered above, morphing its links based on auth state.

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';

// Public pages — bundled immediately
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';

// Protected pages — lazy loaded, only fetched after auth confirmed
const EvzonesStudio  = lazy(() => import('./pages/EvzonesStudio'));
const Dashboard      = lazy(() => import('./pages/Dashboard'));

// ── Loading screen shown while lazy chunks load ────────────────────────────
function PageLoader() {
    return (
        <div style={{
            minHeight: '100vh',
            background: '#040810',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '16px',
            fontFamily: "'Space Mono', monospace",
            color: 'rgba(0,200,255,0.6)',
            fontSize: '0.75rem',
            letterSpacing: '3px'
        }}>
            <div style={{
                width: '32px', height: '32px',
                border: '2px solid rgba(0,200,255,0.2)',
                borderTop: '2px solid #00c8ff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }} />
            INITIALIZING
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ── Auth guard — renders children only if logged in ─────────────────────────
function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <PageLoader />;
    if (!user)   return <Navigate to="/auth" state={{ from: location }} replace />;
    return children;
}

// ── Redirect logged-in users away from /auth ────────────────────────────────
function PublicOnly({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <PageLoader />;
    if (user)    return <Navigate to="/studio" replace />;
    return children;
}

// ── Inner app — has access to auth context + router ─────────────────────────
function AppInner() {
    return (
        <>
            <Navbar />
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    {/* Public */}
                    <Route path="/"     element={<HomePage />} />
                    <Route path="/auth" element={
                        <PublicOnly><AuthPage /></PublicOnly>
                    } />

                    {/* Protected */}
                    <Route path="/studio" element={
                        <RequireAuth><EvzonesStudio /></RequireAuth>
                    } />
                    <Route path="/dashboard" element={
                        <RequireAuth><Dashboard /></RequireAuth>
                    } />

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppInner />
            </AuthProvider>
        </BrowserRouter>
    );
}