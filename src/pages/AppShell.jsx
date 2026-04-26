// src/pages/AppShell.jsx
// Protected shell — only loaded after Firebase auth is confirmed.
// Contains: amber-themed nav + Studio and Dashboard as sub-routes.

import React, { useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EvzonesStudio from './EvzonesStudio';
import Dashboard from './Dashboard';

// ─── Shared design tokens (amber / film-noir theme) ───────────────────────────
const AMBER     = "#c8850a";
const AMBER_DIM = "rgba(180,110,15,0.55)";
const FD = "'Syncopate',sans-serif";
const FM = "'Courier Prime',monospace";
const FB = "'DM Sans',sans-serif";

// ─── Film strip (horizontal) ──────────────────────────────────────────────────
function FilmStrip() {
  return (
    <div style={{height:"22px",background:"linear-gradient(90deg,#120800,#1a0d04 50%,#120800)",borderTop:"1px solid rgba(80,40,5,0.35)",borderBottom:"1px solid rgba(80,40,5,0.35)",display:"flex",alignItems:"center",justifyContent:"space-evenly",padding:"0 12px",flexShrink:0}}>
      {Array.from({length:18}).map((_,i)=>(
        <div key={i} style={{width:"12px",height:"8px",borderRadius:"2px",background:"#060300",boxShadow:"inset 0 1px 2px rgba(0,0,0,0.9),0 0 0 1px rgba(60,30,5,0.4)",flexShrink:0}}/>
      ))}
    </div>
  );
}

// ─── Top Navigation ───────────────────────────────────────────────────────────
function AppNav() {
  const { user, signOut } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [menuOpen, setMenu] = useState(false);

  const handleSignOut = async () => { await signOut(); navigate('/'); };
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navLink = (to, label) => (
    <Link to={to} onClick={()=>setMenu(false)} style={{
      fontFamily: FM, fontSize:"10px", letterSpacing:"0.22em", textTransform:"uppercase",
      color: isActive(to) ? AMBER : AMBER_DIM,
      textDecoration:"none", padding:"8px 14px", borderRadius:"50px",
      background: isActive(to) ? "rgba(200,133,10,0.10)" : "transparent",
      border: isActive(to) ? "1px solid rgba(200,133,10,0.28)" : "1px solid transparent",
      transition:"all 0.2s", display:"block",
    }}>{label}</Link>
  );

  return (
    <>
      <header style={{position:"sticky",top:0,zIndex:40,background:"rgba(6,3,1,0.94)",backdropFilter:"blur(14px)",borderBottom:"1px solid rgba(120,65,5,0.28)"}}>
        <div style={{maxWidth:"1160px",margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"56px",gap:"16px"}}>

          {/* Logo */}
          <Link to="/" style={{display:"flex",alignItems:"center",gap:"10px",textDecoration:"none",flexShrink:0}}>
            <div style={{width:"32px",height:"32px",display:"grid",placeItems:"center",borderRadius:"4px",border:`1px solid rgba(200,133,10,0.40)`,background:"rgba(200,133,10,0.08)"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"1px"}}>
              <span style={{fontFamily:FD,fontSize:"9px",fontWeight:700,color:AMBER,letterSpacing:"0.22em",textTransform:"uppercase"}}>EVZONES</span>
              <span style={{fontFamily:FM,fontSize:"8px",color:AMBER_DIM,letterSpacing:"0.14em",textTransform:"uppercase"}}>Protocol</span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <nav style={{display:"flex",alignItems:"center",gap:"4px",flex:1,justifyContent:"center"}}>
            <div className="desktop-nav" style={{display:"flex",gap:"4px"}}>
              {navLink("/app/studio","Studio")}
              {navLink("/app/dashboard","Dashboard")}
            </div>
          </nav>

          {/* User + signout */}
          <div style={{display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
            <div className="desktop-user" style={{display:"flex",alignItems:"center",gap:"8px",background:"rgba(200,133,10,0.06)",border:"1px solid rgba(200,133,10,0.15)",padding:"6px 12px",borderRadius:"50px"}}>
              <div style={{width:"6px",height:"6px",borderRadius:"50%",background:AMBER,boxShadow:`0 0 6px ${AMBER}`}}/>
              <span style={{fontFamily:FM,fontSize:"9px",color:AMBER_DIM,letterSpacing:"0.12em",maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {user?.displayName || user?.email?.split('@')[0]}
              </span>
            </div>
            <button onClick={handleSignOut} className="desktop-user"
              style={{fontFamily:FM,fontSize:"9px",letterSpacing:"0.16em",textTransform:"uppercase",color:"rgba(180,80,60,0.7)",background:"transparent",border:"1px solid rgba(180,80,60,0.25)",padding:"7px 14px",borderRadius:"50px",cursor:"pointer",transition:"all 0.2s"}}>
              Exit
            </button>
            {/* Mobile hamburger */}
            <button onClick={()=>setMenu(!menuOpen)} className="mobile-menu-btn"
              style={{display:"none",background:"none",border:"none",cursor:"pointer",padding:"4px",flexDirection:"column",gap:"5px"}}>
              <span style={{display:"block",width:"20px",height:"1.5px",background:AMBER_DIM,transition:"all 0.3s",transform:menuOpen?"rotate(45deg) translate(5px,5px)":"none"}}/>
              <span style={{display:"block",width:"20px",height:"1.5px",background:AMBER_DIM,opacity:menuOpen?0:1}}/>
              <span style={{display:"block",width:"20px",height:"1.5px",background:AMBER_DIM,transform:menuOpen?"rotate(-45deg) translate(5px,-5px)":"none"}}/>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div style={{background:"rgba(6,3,1,0.98)",borderTop:"1px solid rgba(120,65,5,0.28)",padding:"12px 20px",display:"flex",flexDirection:"column",gap:"4px"}}>
            {navLink("/app/studio","Studio")}
            {navLink("/app/dashboard","Dashboard")}
            <div style={{height:"1px",background:"rgba(120,65,5,0.28)",margin:"8px 0"}}/>
            <span style={{fontFamily:FM,fontSize:"9px",color:AMBER_DIM,padding:"6px 14px"}}>{user?.email}</span>
            <button onClick={handleSignOut} style={{fontFamily:FM,fontSize:"9px",letterSpacing:"0.16em",textTransform:"uppercase",color:"rgba(180,80,60,0.7)",background:"rgba(180,80,60,0.06)",border:"1px solid rgba(180,80,60,0.2)",padding:"10px 14px",borderRadius:"50px",cursor:"pointer",textAlign:"center"}}>Sign Out</button>
          </div>
        )}
      </header>

      <style>{`
        @media(max-width:640px){
          .desktop-nav,.desktop-user{display:none!important}
          .mobile-menu-btn{display:flex!important}
        }
      `}</style>
    </>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
export default function AppShell() {
  return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 50% 0%,#2a1200 0%,#130800 35%,#080400 70%,#030200 100%)"}}>
      <AppNav/>
      <FilmStrip/>
      <Routes>
        <Route path="/"         element={<EvzonesStudio />} />
        <Route path="/studio"   element={<EvzonesStudio />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </div>
  );
}