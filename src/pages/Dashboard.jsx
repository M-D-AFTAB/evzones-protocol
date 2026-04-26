// src/pages/Dashboard.jsx — Amber film-noir theme
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const VAULT_URL = (() => {
    if (import.meta.env.VITE_VAULT_URL) return import.meta.env.VITE_VAULT_URL;
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:3001' : window.location.origin;
})();

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER     = "#c8850a";
const AMBER_DIM = "rgba(180,110,15,0.55)";
const AMBER_BG  = "rgba(200,133,10,0.06)";
const FM = "'Courier Prime',monospace";
const FB = "'DM Sans',sans-serif";
const FD = "'Syncopate',sans-serif";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (sec) => {
    if (!sec && sec !== 0) return '--:--';
    return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
};
const ago = (iso) => {
    if (!iso) return '—';
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 5)   return 'just now';
    if (s < 60)  return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    return `${Math.floor(s/3600)}h ago`;
};
const isLive = (ts) => ts && (Date.now() - new Date(ts)) < 30000;
const hashHue = (id) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    return Math.abs(h) % 360;
};
const viewerColor = (id) => `hsl(${hashHue(id)},60%,62%)`;

// ── Corner brackets ───────────────────────────────────────────────────────────
function Brackets({ color = "rgba(180,110,15,0.28)", size = 10 }) {
    return (
        <>
            {[{t:'8px',l:'8px',bt:1,bl:1},{t:'8px',r:'8px',bt:1,br:1},
              {b:'8px',l:'8px',bb:1,bl:1},{b:'8px',r:'8px',bb:1,br:1}].map((p,i)=>(
                <div key={i} style={{
                    position:'absolute',top:p.t,left:p.l,right:p.r,bottom:p.b,
                    width:`${size}px`,height:`${size}px`,pointerEvents:'none',
                    borderTop:p.bt?`1.5px solid ${color}`:'none',
                    borderBottom:p.bb?`1.5px solid ${color}`:'none',
                    borderLeft:p.bl?`1.5px solid ${color}`:'none',
                    borderRight:p.br?`1.5px solid ${color}`:'none',
                }}/>
            ))}
        </>
    );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ children, style={}, hover=false }) {
    const [hov, setHov] = useState(false);
    return (
        <div onMouseEnter={()=>hover&&setHov(true)} onMouseLeave={()=>hover&&setHov(false)}
            style={{position:'relative',borderRadius:'4px',
                background:'linear-gradient(160deg,rgba(18,8,2,0.88) 0%,rgba(10,5,1,0.94) 100%)',
                border:`1px solid ${hov?'rgba(200,133,10,0.32)':'rgba(120,65,5,0.26)'}`,
                boxShadow:hov?'0 0 24px rgba(200,133,10,0.08)':'inset 0 1px 0 rgba(255,255,255,0.02)',
                transition:'border-color 0.2s,box-shadow 0.2s',...style}}>
            <Brackets color={hov?'rgba(200,133,10,0.45)':'rgba(180,110,15,0.25)'}/>
            {children}
        </div>
    );
}

// ── Section label ─────────────────────────────────────────────────────────────
const SectionLabel = ({children}) => (
    <div style={{fontFamily:FM,fontSize:'9px',color:AMBER,letterSpacing:'0.28em',textTransform:'uppercase',marginBottom:'6px'}}>
        {children}
    </div>
);

// ── Stat box ──────────────────────────────────────────────────────────────────
function StatBox({ val, label, live=false }) {
    return (
        <div style={{textAlign:'center',padding:'0 12px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                {live && val>0 && <span style={{display:'inline-block',width:'6px',height:'6px',borderRadius:'50%',background:AMBER,boxShadow:`0 0 8px ${AMBER}`,animation:'amberpulse 1.2s ease-out infinite'}}/>}
                <span style={{fontFamily:FM,fontSize:'clamp(1.4rem,3vw,2rem)',fontWeight:700,color:live&&val>0?AMBER:'rgba(240,232,208,0.8)',lineHeight:1}}>
                    {val}
                </span>
            </div>
            <div style={{fontFamily:FM,fontSize:'8px',color:AMBER_DIM,letterSpacing:'0.18em',marginTop:'5px'}}>{label}</div>
        </div>
    );
}

// ── Playhead timeline ─────────────────────────────────────────────────────────
function Timeline({ sessions }) {
    const active   = sessions.filter(s=>isLive(s.last_seen));
    const maxCP    = sessions.reduce((m,s)=>Math.max(m,s.checkpoint||0),0);
    const total    = Math.max(maxCP*1.1,60);

    return (
        <div>
            <div style={{position:'relative',height:'44px',background:'rgba(5,2,0,0.7)',border:'1px solid rgba(120,65,5,0.22)',borderRadius:'3px',marginBottom:'10px',overflow:'hidden'}}>
                {/* track line */}
                <div style={{position:'absolute',top:'50%',left:0,right:0,height:'1px',background:'rgba(180,110,15,0.15)',transform:'translateY(-50%)'}}/>
                {/* time markers */}
                {[0,0.25,0.5,0.75,1].map(p=>(
                    <div key={p} style={{position:'absolute',top:0,bottom:0,left:`${p*100}%`,display:'flex',alignItems:'flex-end',paddingBottom:'5px',transform:'translateX(-50%)'}}>
                        <span style={{fontFamily:FM,fontSize:'7px',color:'rgba(180,110,15,0.4)',letterSpacing:'0.08em'}}>{fmt(total*p)}</span>
                    </div>
                ))}
                {/* viewer dots */}
                {active.map(s=>{
                    const pct = Math.min((s.checkpoint||0)/total*100,99);
                    const col = viewerColor(s.id);
                    return (
                        <div key={s.id} title={`${s.viewer_ip||'viewer'} · ${fmt(s.checkpoint)}`}
                            style={{position:'absolute',top:0,bottom:0,left:`${pct}%`,transform:'translateX(-50%)',display:'flex',flexDirection:'column',alignItems:'center',zIndex:2}}>
                            <div style={{width:'10px',height:'10px',borderRadius:'50%',background:col,boxShadow:`0 0 8px ${col}`,marginTop:'9px',flexShrink:0,animation:'dotpop 2s ease-in-out infinite'}}/>
                            <span style={{fontFamily:FM,fontSize:'6px',color:col,background:'rgba(5,2,0,0.8)',padding:'1px 3px',borderRadius:'2px',whiteSpace:'nowrap',marginTop:'1px'}}>{fmt(s.checkpoint)}</span>
                        </div>
                    );
                })}
            </div>
            {active.length===0 && <p style={{fontFamily:FM,fontSize:'9px',color:'rgba(180,110,15,0.3)',letterSpacing:'0.12em'}}>No active viewers — playheads appear here in real-time</p>}
        </div>
    );
}

// ── World map (SVG equirectangular) ──────────────────────────────────────────
const geoCache = {};
async function geoIP(ip) {
    if (!ip||ip==='unknown'||ip.startsWith('127.')||ip.startsWith('192.168')) return null;
    if (geoCache[ip]) return geoCache[ip];
    try {
        const r = await fetch(`https://ipapi.co/${ip}/json/`);
        const d = await r.json();
        if (d.latitude&&d.longitude) { geoCache[ip]={lat:d.latitude,lon:d.longitude,city:d.city,country:d.country_name}; return geoCache[ip]; }
    } catch { }
    return null;
}

function WorldMap({ sessions }) {
    const [geo,setGeo] = useState({});
    useEffect(()=>{
        sessions.filter(s=>isLive(s.last_seen)).forEach(async s=>{
            if (s.viewer_ip&&!geo[s.viewer_ip]) {
                const g = await geoIP(s.viewer_ip);
                if (g) setGeo(prev=>({...prev,[s.viewer_ip]:g}));
            }
        });
    },[sessions]);

    const toXY = (lat,lon) => ({ x:((lon+180)/360)*1000, y:((90-lat)/180)*500 });

    return (
        <div style={{border:'1px solid rgba(120,65,5,0.22)',borderRadius:'3px',overflow:'hidden',background:'rgba(5,2,0,0.6)'}}>
            <svg viewBox="0 0 1000 500" style={{display:'block',width:'100%',height:'auto'}}>
                {/* Grid */}
                <defs><pattern id="mgrid" width="100" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 100 0 L 0 0 0 50" fill="none" stroke="rgba(200,133,10,0.04)" strokeWidth="0.5"/>
                </pattern></defs>
                <rect width="1000" height="500" fill="url(#mgrid)"/>
                {[-60,-30,0,30,60].map(lat=><line key={lat} x1="0" y1={(90-lat)/180*500} x2="1000" y2={(90-lat)/180*500} stroke="rgba(200,133,10,0.06)" strokeWidth="0.5" strokeDasharray="4,4"/>)}
                {[-120,-60,0,60,120].map(lon=><line key={lon} x1={(lon+180)/360*1000} y1="0" x2={(lon+180)/360*1000} y2="500" stroke="rgba(200,133,10,0.06)" strokeWidth="0.5" strokeDasharray="4,4"/>)}
                {/* Continent outlines */}
                {[
                    "M 80,60 L 90,50 L 120,50 L 150,70 L 160,100 L 180,110 L 200,130 L 220,150 L 210,170 L 190,180 L 170,200 L 160,220 L 140,240 L 120,250 L 100,240 L 90,220 L 80,190 L 70,170 L 75,130 L 70,100 Z",
                    "M 170,240 L 195,230 L 210,250 L 220,280 L 215,320 L 200,360 L 185,400 L 175,420 L 165,400 L 155,360 L 150,320 L 155,280 L 160,260 Z",
                    "M 440,60 L 480,55 L 510,70 L 520,90 L 500,110 L 490,130 L 470,140 L 450,130 L 430,110 L 435,85 Z",
                    "M 450,140 L 490,135 L 520,155 L 535,190 L 540,240 L 530,290 L 510,330 L 490,360 L 475,370 L 460,355 L 445,310 L 435,270 L 430,220 L 435,175 Z",
                    "M 510,55 L 600,45 L 700,50 L 780,60 L 820,80 L 840,110 L 820,140 L 780,150 L 740,160 L 700,155 L 660,150 L 620,145 L 580,140 L 550,130 L 520,110 L 505,85 Z",
                    "M 620,145 L 650,150 L 660,180 L 650,220 L 640,250 L 625,260 L 610,245 L 600,210 L 605,175 Z",
                    "M 740,160 L 770,165 L 790,185 L 775,205 L 750,200 L 730,185 Z",
                    "M 760,290 L 820,275 L 870,285 L 890,310 L 880,350 L 850,380 L 810,390 L 770,375 L 748,345 L 750,310 Z",
                ].map((d,i)=><path key={i} d={d} fill="rgba(200,133,10,0.07)" stroke="rgba(200,133,10,0.18)" strokeWidth="0.8"/>)}
                {/* Live viewer dots */}
                {sessions.filter(s=>isLive(s.last_seen)).map(s=>{
                    const g = geo[s.viewer_ip]; if(!g) return null;
                    const {x,y} = toXY(g.lat,g.lon);
                    const col = viewerColor(s.id);
                    return (
                        <g key={s.id}>
                            <circle cx={x} cy={y} r="8" fill="none" stroke={col} strokeWidth="1" opacity="0.5">
                                <animate attributeName="r" values="4;14;4" dur="2s" repeatCount="indefinite"/>
                                <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite"/>
                            </circle>
                            <circle cx={x} cy={y} r="4" fill={col} opacity="0.9">
                                <title>{g.city}, {g.country} — {s.viewer_ip}</title>
                            </circle>
                        </g>
                    );
                })}
                {sessions.filter(s=>isLive(s.last_seen)&&!geo[s.viewer_ip]).length>0&&(
                    <text x="8" y="492" fontSize="10" fill="rgba(200,133,10,0.35)" fontFamily="monospace">
                        {sessions.filter(s=>isLive(s.last_seen)&&!geo[s.viewer_ip]).length} viewer(s) locating…
                    </text>
                )}
            </svg>
        </div>
    );
}

// ── Live Tracking Modal ────────────────────────────────────────────────────────
function TrackingModal({ asset, onClose, onKill }) {
    const [data, setData]    = useState(asset);
    const [killing,setKill]  = useState(false);
    const pollRef            = useRef(null);

    const refresh = useCallback(async()=>{
        try {
            const r = await fetch(`${VAULT_URL}/api/dashboard/asset?id=${asset.id}`);
            if (r.ok) setData(await r.json());
        } catch {}
    },[asset.id]);

    useEffect(()=>{ pollRef.current=setInterval(refresh,5000); return()=>clearInterval(pollRef.current); },[refresh]);

    const active = (data.sessions||[]).filter(s=>isLive(s.last_seen));

    const handleKill = async () => {
        if (!confirm(`Kill "${data.file_name}"?\n\nBlocks all viewers immediately. Cannot be undone.`)) return;
        setKill(true);
        await onKill(data.id);
        setKill(false);
        onClose();
    };

    return (
        <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.8)',backdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}
            onClick={e=>e.target===e.currentTarget&&onClose()}>
            <div style={{
                position:'relative',background:'linear-gradient(160deg,rgba(18,8,2,0.99),rgba(8,4,1,1))',
                border:'1px solid rgba(150,80,10,0.35)',borderRadius:'6px',
                width:'100%',maxWidth:'860px',maxHeight:'90vh',display:'flex',flexDirection:'column',
                boxShadow:'0 40px 80px rgba(0,0,0,0.7),0 0 60px rgba(200,133,10,0.05)',
                animation:'modalIn 0.25s ease',
            }}>
                <Brackets color="rgba(200,133,10,0.3)" size={12}/>
                <style>{`@keyframes modalIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'18px 22px',borderBottom:'1px solid rgba(120,65,5,0.22)',flexShrink:0,flexWrap:'wrap',gap:'10px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'12px',minWidth:0}}>
                        <span style={{fontSize:'1.4rem',flexShrink:0}}>{active.length>0?'📡':'🔒'}</span>
                        <div style={{minWidth:0}}>
                            <div style={{fontFamily:FD,fontSize:'11px',fontWeight:700,color:'#f0e8d0',letterSpacing:'0.1em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{data.file_name}</div>
                            <code style={{fontFamily:FM,fontSize:'8px',color:AMBER_DIM}}>{data.id.slice(0,20)}…</code>
                        </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'12px',flexShrink:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px',fontFamily:FM,fontSize:'9px',color:active.length>0?AMBER:AMBER_DIM,letterSpacing:'0.16em'}}>
                            {active.length>0&&<span style={{width:'7px',height:'7px',borderRadius:'50%',background:AMBER,boxShadow:`0 0 6px ${AMBER}`,animation:'amberpulse 1.2s ease-out infinite',display:'inline-block'}}/>}
                            {active.length} LIVE · {(data.sessions||[]).length} TOTAL
                        </div>
                        <button onClick={onClose} style={{background:'rgba(200,133,10,0.06)',border:'1px solid rgba(200,133,10,0.18)',color:AMBER_DIM,width:'28px',height:'28px',borderRadius:'50%',cursor:'pointer',fontSize:'0.85rem',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}
                            onMouseEnter={e=>e.currentTarget.style.color='#f0e8d0'} onMouseLeave={e=>e.currentTarget.style.color=AMBER_DIM}>✕</button>
                    </div>
                </div>

                {/* Body */}
                <div style={{overflowY:'auto',padding:'20px 22px',display:'flex',flexDirection:'column',gap:'22px'}}>

                    {/* Map */}
                    <div>
                        <SectionLabel>Viewer Locations <span style={{color:AMBER_DIM,fontSize:'8px'}}>· {active.length} active</span></SectionLabel>
                        <WorldMap sessions={data.sessions||[]}/>
                    </div>

                    {/* Timeline */}
                    <div>
                        <SectionLabel>Live Playhead Positions <span style={{color:AMBER_DIM,fontSize:'8px'}}>· updates every 5s</span></SectionLabel>
                        <Timeline sessions={data.sessions||[]}/>
                    </div>

                    {/* Session log */}
                    <div>
                        <SectionLabel>Session Log <span style={{color:AMBER_DIM,fontSize:'8px'}}>· {(data.sessions||[]).length} records</span></SectionLabel>
                        <div style={{border:'1px solid rgba(120,65,5,0.2)',borderRadius:'3px',overflow:'hidden'}}>
                            <div style={{display:'grid',gridTemplateColumns:'72px 120px 90px 90px 1fr',padding:'8px 14px',background:'rgba(5,2,0,0.6)',fontFamily:FM,fontSize:'8px',color:AMBER_DIM,letterSpacing:'0.16em',borderBottom:'1px solid rgba(120,65,5,0.18)'}}>
                                <span>STATUS</span><span>IP</span><span>PLAYHEAD</span><span>LAST SEEN</span><span>DOMAIN</span>
                            </div>
                            {(data.sessions||[]).length===0&&<div style={{padding:'18px',fontFamily:FM,fontSize:'9px',color:'rgba(180,110,15,0.3)',textAlign:'center',letterSpacing:'0.14em'}}>No sessions yet</div>}
                            {(data.sessions||[]).sort((a,b)=>new Date(b.last_seen)-new Date(a.last_seen)).map(s=>{
                                const live=isLive(s.last_seen);
                                const col=viewerColor(s.id);
                                return (
                                    <div key={s.id} style={{display:'grid',gridTemplateColumns:'72px 120px 90px 90px 1fr',padding:'8px 14px',borderBottom:'1px solid rgba(120,65,5,0.10)',fontFamily:FM,fontSize:'9px',color:live?'rgba(240,232,208,0.8)':'rgba(180,110,15,0.4)',background:live?'rgba(200,133,10,0.03)':'transparent',alignItems:'center'}}>
                                        <span style={{display:'flex',alignItems:'center',gap:'5px'}}>
                                            <span style={{width:'5px',height:'5px',borderRadius:'50%',background:live?AMBER:'rgba(180,110,15,0.3)',boxShadow:live?`0 0 5px ${AMBER}`:'none',flexShrink:0}}/>
                                            {live?'LIVE':'ended'}
                                        </span>
                                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.viewer_ip||'—'}</span>
                                        <span style={{display:'flex',alignItems:'center',gap:'5px'}}>
                                            {live&&<div style={{width:'28px',height:'3px',background:'rgba(200,133,10,0.12)',borderRadius:'2px',overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min((s.checkpoint||0)/300*100,100)}%`,background:col,transition:'width 0.5s'}}/></div>}
                                            {fmt(s.checkpoint)}
                                        </span>
                                        <span>{ago(s.last_seen)}</span>
                                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'8px'}}>
                                            {s.viewer_url?(() => { try { return new URL(s.viewer_url).hostname; } catch { return s.viewer_url; } })():'—'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Kill switch */}
                    {!data.killed ? (
                        <div style={{borderTop:'1px solid rgba(180,50,50,0.14)',paddingTop:'18px'}}>
                            <button onClick={handleKill} disabled={killing}
                                style={{width:'100%',background:'rgba(180,50,50,0.07)',border:'1px solid rgba(180,50,50,0.28)',color:'#d47070',fontFamily:FM,fontSize:'9px',fontWeight:700,letterSpacing:'0.16em',textTransform:'uppercase',padding:'12px',borderRadius:'50px',cursor:killing?'not-allowed':'pointer',transition:'all 0.2s',opacity:killing?0.5:1}}>
                                {killing?'Killing…':'💀  Kill Asset — Revoke All Playback Globally'}
                            </button>
                            <p style={{fontFamily:FM,fontSize:'8px',color:'rgba(180,80,60,0.4)',textAlign:'center',marginTop:'7px',letterSpacing:'0.1em'}}>Immediately blocks all viewers. Cannot be undone.</p>
                        </div>
                    ) : (
                        <div style={{background:'rgba(180,50,50,0.06)',border:'1px solid rgba(180,50,50,0.2)',borderRadius:'4px',padding:'12px 14px',fontFamily:FM,fontSize:'9px',color:'#c07070',letterSpacing:'0.12em',textAlign:'center'}}>
                            💀 KILLED — All playback permanently revoked
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Asset Card ────────────────────────────────────────────────────────────────
function AssetCard({ asset, onTrack, onKill }) {
    const live  = (asset.sessions||[]).filter(s=>isLive(s.last_seen)).length;
    const total = (asset.sessions||[]).length;

    return (
        <Panel hover style={{padding:'20px'}}>
            {/* Top row */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px',gap:'8px'}}>
                <span style={{fontSize:'1.4rem',flexShrink:0}}>{asset.killed?'💀':live>0?'📡':'🔒'}</span>
                <div style={{fontFamily:FM,fontSize:'8px',fontWeight:700,letterSpacing:'0.16em',padding:'4px 10px',borderRadius:'50px',background:asset.killed?'rgba(180,50,50,0.08)':live>0?AMBER_BG:'rgba(120,65,5,0.12)',border:`1px solid ${asset.killed?'rgba(180,50,50,0.25)':live>0?'rgba(200,133,10,0.3)':'rgba(120,65,5,0.22)'}`,color:asset.killed?'#c07070':live>0?AMBER:AMBER_DIM}}>
                    {asset.killed?'KILLED':live>0?`● LIVE · ${live}`:'ACTIVE'}
                </div>
            </div>

            {/* Name */}
            <div style={{fontFamily:FB,fontSize:'13px',fontWeight:600,color:'#f0e8d0',marginBottom:'3px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{asset.file_name}</div>
            <code style={{fontFamily:FM,fontSize:'8px',color:AMBER_DIM,display:'block',marginBottom:'4px'}}>{asset.id.slice(0,14)}…</code>
            <div style={{fontFamily:FM,fontSize:'8px',color:'rgba(180,110,15,0.4)',letterSpacing:'0.1em',marginBottom:'14px'}}>
                {new Date(asset.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
            </div>

            {/* Stats */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px',marginBottom:'14px',paddingBottom:'14px',borderBottom:'1px solid rgba(120,65,5,0.15)'}}>
                {[[live,'LIVE',true],[total,'SESSIONS'],[asset.segment_count||0,'SEGMENTS'],[(asset.whitelist||[]).length,'DOMAINS']].map(([v,l,lv],i)=>(
                    <div key={i} style={{textAlign:'center'}}>
                        <div style={{fontFamily:FM,fontSize:'1.1rem',fontWeight:700,color:lv&&v>0?AMBER:'rgba(240,232,208,0.7)',lineHeight:1}}>{v}</div>
                        <div style={{fontFamily:FM,fontSize:'7px',color:AMBER_DIM,letterSpacing:'0.12em',marginTop:'3px'}}>{l}</div>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div style={{display:'flex',gap:'8px'}}>
                <button onClick={()=>onTrack(asset)}
                    style={{flex:1,background:AMBER_BG,border:`1px solid rgba(200,133,10,0.22)`,color:AMBER,fontFamily:FM,fontSize:'8px',fontWeight:700,letterSpacing:'0.16em',textTransform:'uppercase',padding:'10px',borderRadius:'50px',cursor:'pointer',transition:'all 0.2s',position:'relative',overflow:'hidden'}}>
                    <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,transparent,rgba(255,245,180,0.15),transparent)',animation:'shimmer 2.6s ease-in-out infinite'}}/>
                    <span style={{position:'relative'}}>{live>0?'📡 Live Track':'📊 View Stats'}</span>
                </button>
                {!asset.killed&&(
                    <button onClick={()=>confirm(`Kill "${asset.file_name}"?`)&&onKill(asset.id)}
                        title="Kill asset" style={{background:'rgba(180,50,50,0.06)',border:'1px solid rgba(180,50,50,0.18)',color:'rgba(180,80,60,0.7)',padding:'10px 14px',borderRadius:'50px',cursor:'pointer',fontSize:'0.9rem',transition:'all 0.2s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(180,50,50,0.12)'}
                        onMouseLeave={e=>e.currentTarget.style.background='rgba(180,50,50,0.06)'}>
                        💀
                    </button>
                )}
            </div>
        </Panel>
    );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
    const { user }            = useAuth();
    const [assets,setAssets]  = useState([]);
    const [loading,setLoad]   = useState(true);
    const [error,setError]    = useState('');
    const [tracking,setTrack] = useState(null);
    const pollRef             = useRef(null);

    const load = useCallback(async()=>{
        if (!user?.email) return;
        try {
            const r = await fetch(`${VAULT_URL}/api/dashboard?email=${encodeURIComponent(user.email)}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            setAssets(d.assets||[]);
        } catch(e) { setError(e.message); }
        finally { setLoad(false); }
    },[user?.email]);

    useEffect(()=>{ load(); pollRef.current=setInterval(load,8000); return()=>clearInterval(pollRef.current); },[load]);

    const handleKill = async(assetID)=>{
        try {
            await fetch(`${VAULT_URL}/api/kill`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetID,ownerEmail:user.email})});
            await load();
        } catch(e) { alert('Kill failed: '+e.message); }
    };

    const totalLive = assets.reduce((s,a)=>s+(a.sessions||[]).filter(x=>isLive(x.last_seen)).length,0);
    const sorted    = [...assets].sort((a,b)=>{
        const al=(a.sessions||[]).filter(s=>isLive(s.last_seen)).length;
        const bl=(b.sessions||[]).filter(s=>isLive(s.last_seen)).length;
        return bl-al||new Date(b.created_at)-new Date(a.created_at);
    });

    return (
        <div style={{padding:'24px 20px 60px',maxWidth:'1160px',margin:'0 auto'}}>
            <style>{`
                @keyframes amberpulse{0%{box-shadow:0 0 0 0 rgba(200,133,10,0.5)}70%{box-shadow:0 0 0 8px rgba(200,133,10,0)}100%{box-shadow:0 0 0 0 rgba(200,133,10,0)}}
                @keyframes dotpop{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
                @keyframes shimmer{0%{transform:translateX(-120%)}100%{transform:translateX(220%)}}
                @media(max-width:600px){.db-stat-sep{display:none!important}.db-stats-row{flex-wrap:wrap;gap:12px!important}}
            `}</style>

            {/* Page header */}
            <div style={{marginBottom:'28px'}}>
                <SectionLabel>Surveillance Console</SectionLabel>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:'12px'}}>
                    <h1 style={{fontFamily:FD,fontWeight:700,fontSize:'clamp(18px,4vw,28px)',color:'#f0e8d0',letterSpacing:'0.08em',textTransform:'uppercase',margin:0}}>
                        Asset Dashboard
                    </h1>
                    <a href="/app/studio" style={{display:'inline-flex',alignItems:'center',gap:'8px',padding:'10px 20px',borderRadius:'50px',background:AMBER_BG,border:`1px solid rgba(200,133,10,0.28)`,color:AMBER,fontFamily:FM,fontSize:'9px',fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',textDecoration:'none',transition:'all 0.2s',position:'relative',overflow:'hidden'}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(200,133,10,0.12)'}
                        onMouseLeave={e=>e.currentTarget.style.background=AMBER_BG}>
                        <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,transparent,rgba(255,245,180,0.2),transparent)',animation:'shimmer 2.6s ease-in-out infinite'}}/>
                        <span style={{position:'relative'}}>+ Protect New Video</span>
                    </a>
                </div>
                <p style={{fontFamily:FB,fontSize:'12px',color:AMBER_DIM,marginTop:'6px'}}>{user?.email}</p>
            </div>

            {/* Global stats */}
            <Panel style={{padding:'18px 24px',marginBottom:'24px'}}>
                <div className="db-stats-row" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:'8px'}}>
                    <StatBox val={totalLive} label="VIEWERS NOW" live/>
                    <div className="db-stat-sep" style={{width:'1px',height:'40px',background:'rgba(120,65,5,0.25)'}}/>
                    <StatBox val={assets.filter(a=>!a.killed).length} label="ACTIVE ASSETS"/>
                    <div className="db-stat-sep" style={{width:'1px',height:'40px',background:'rgba(120,65,5,0.25)'}}/>
                    <StatBox val={assets.filter(a=>a.killed).length} label="KILLED"/>
                    <div className="db-stat-sep" style={{width:'1px',height:'40px',background:'rgba(120,65,5,0.25)'}}/>
                    <StatBox val={assets.reduce((s,a)=>s+(a.sessions||[]).length,0)} label="TOTAL SESSIONS"/>
                </div>
            </Panel>

            {/* Error */}
            {error&&<div style={{background:'rgba(180,50,50,0.07)',border:'1px solid rgba(180,50,50,0.22)',borderRadius:'4px',padding:'12px 16px',fontFamily:FM,fontSize:'9px',color:'#d47070',marginBottom:'16px',letterSpacing:'0.1em'}}>⚠ {error} — check vault URL and API keys</div>}

            {/* Loading */}
            {loading&&(
                <div style={{textAlign:'center',padding:'60px 0',fontFamily:FM,fontSize:'9px',color:AMBER_DIM,letterSpacing:'0.18em',display:'flex',alignItems:'center',justifyContent:'center',gap:'12px'}}>
                    <div style={{width:'18px',height:'18px',border:'1.5px solid rgba(200,133,10,0.2)',borderTop:`1.5px solid ${AMBER}`,borderRadius:'50%',animation:'spin 1s linear infinite'}}/> Loading…
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            {/* Empty */}
            {!loading&&assets.length===0&&!error&&(
                <div style={{textAlign:'center',padding:'80px 24px'}}>
                    <div style={{fontSize:'3rem',marginBottom:'16px',opacity:0.3}}>🔒</div>
                    <div style={{fontFamily:FD,fontSize:'14px',fontWeight:700,color:'#f0e8d0',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'8px'}}>No Protected Assets</div>
                    <p style={{fontFamily:FB,fontSize:'13px',color:AMBER_DIM,marginBottom:'24px'}}>Go to the Studio to protect your first video.</p>
                    <a href="/app/studio" style={{display:'inline-flex',alignItems:'center',gap:'8px',padding:'13px 28px',borderRadius:'50px',background:'linear-gradient(to right,#a06008,#c8850a,#d49520,#c8850a,#a06008)',border:'1px solid rgba(200,140,30,0.45)',color:'#fff8e0',fontFamily:FB,fontWeight:800,fontSize:'12px',letterSpacing:'0.12em',textTransform:'uppercase',textDecoration:'none',boxShadow:'0 6px 28px rgba(160,90,5,0.40)',position:'relative',overflow:'hidden'}}>
                        <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,transparent,rgba(255,245,180,0.28),transparent)',animation:'shimmer 2.6s ease-in-out infinite'}}/>
                        <span style={{position:'relative'}}>Open Studio →</span>
                    </a>
                </div>
            )}

            {/* Asset grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'16px'}}>
                {sorted.map(a=>(
                    <AssetCard key={a.id} asset={a} onTrack={setTrack} onKill={handleKill}/>
                ))}
            </div>

            {/* Modal */}
            {tracking&&<TrackingModal asset={tracking} onClose={()=>setTrack(null)} onKill={handleKill}/>}
        </div>
    );
}