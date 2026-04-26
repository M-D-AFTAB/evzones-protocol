// src/App.jsx
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import LoginPage from './pages/LoginPage';

// Protected — lazy loaded. Never downloaded without confirmed auth.
const AppShell = lazy(() => import('./pages/AppShell'));

function Loader() {
    return (
        <div style={{
            minHeight:'100vh',
            background:'radial-gradient(ellipse at 50% 48%, #3a1800 0%, #180900 30%, #080400 65%, #030200 100%)',
            display:'flex',alignItems:'center',justifyContent:'center',
        }}>
            <div style={{
                width:'32px',height:'32px',
                border:'2px solid rgba(200,133,10,0.2)',
                borderTop:'2px solid #c8850a',
                borderRadius:'50%',animation:'spin 1s linear infinite',
            }}/>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) return <Loader />;
    if (!user)   return <Navigate to="/login" state={{ from: location }} replace />;
    return children;
}

function PublicOnly({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <Loader />;
    if (user)    return <Navigate to="/app" replace />;
    return children;
}

function AppInner() {
    return (
        <Suspense fallback={<Loader />}>
            <Routes>
                <Route path="/"      element={<Landing />} />
                <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
                <Route path="/app/*" element={<RequireAuth><AppShell /></RequireAuth>} />
                <Route path="*"      element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
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