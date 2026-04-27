// src/App.jsx
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';   // NEW
import Landing from './pages/Landing';
import LoginPage from './pages/LoginPage';

const AppShell = lazy(() => import('./pages/AppShell'));

function Loader() {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',   // updated
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                width: '32px', height: '32px',
                border: '2px solid var(--border)',
                borderTop: '2px solid var(--accent)',
                borderRadius: '50%', animation: 'spin 1s linear infinite',
            }}/>
        </div>
    );
}

function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) return <Loader />;
    if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
    return children;
}

function PublicOnly({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <Loader />;
    if (user) return <Navigate to="/app" replace />;
    return children;
}

function AppInner() {
    return (
        <Suspense fallback={<Loader />}>
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
                <Route path="/app/*" element={<RequireAuth><AppShell /></RequireAuth>} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>          {/* NEW: wrap everything with ThemeProvider */}
                <AuthProvider>
                    <AppInner />
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}