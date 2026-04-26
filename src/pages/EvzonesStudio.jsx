// src/pages/EvzonesStudio.jsx — Amber film-noir theme, mobile responsive
import React, { useState, useCallback } from 'react';
import { processEvzonesVideo, generateSmartAsset } from '../utils/evzonesEngine';
import { useAuth } from '../context/AuthContext';

const VAULT_URL = (() => {
    if (import.meta.env.VITE_VAULT_URL) return import.meta.env.VITE_VAULT_URL;
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:3001' : window.location.origin;
})();

const AMBER = "#c8850a";
const AMBER_DIM = "rgba(180,110,15,0.55)";
const FM = "'Courier Prime',monospace";
const FB = "'DM Sans',sans-serif";

// ── Corner brackets (from team's design system) ───────────────────────────────
function Brackets({ color = "rgba(180,110,15,0.35)", size = 12 }) {
    return (
        <>
            {[{top:"8px",left:"8px",bt:true,bl:true},{top:"8px",right:"8px",bt:true,br:true},
              {bottom:"8px",left:"8px",bb:true,bl:true},{bottom:"8px",right:"8px",bb:true,br:true}].map((p,i)=>(
                <div key={i} style={{position:"absolute",top:p.top,left:p.left,right:p.right,bottom:p.bottom,width:`${size}px`,height:`${size}px`,
                    borderTop:p.bt?`1.5px solid ${color}`:"none",borderBottom:p.bb?`1.5px solid ${color}`:"none",
                    borderLeft:p.bl?`1.5px solid ${color}`:"none",borderRight:p.br?`1.5px solid ${color}`:"none",
                    pointerEvents:"none"}}/>
            ))}
        </>
    );
}

// ── Panel (from team's design system) ─────────────────────────────────────────
function Panel({ children, style = {} }) {
    return (
        <div style={{
            position:"relative", borderRadius:"4px",
            background:"linear-gradient(160deg,rgba(18,8,2,0.85) 0%,rgba(10,5,1,0.92) 100%)",
            border:"1px solid rgba(120,65,5,0.28)",
            boxShadow:"inset 0 1px 0 rgba(255,255,255,0.02)", ...style
        }}>
            <Brackets/>
            {children}
        </div>
    );
}

// ── Label style ───────────────────────────────────────────────────────────────
const lbl = { fontFamily:FM, fontSize:"9px", color:AMBER, letterSpacing:"0.28em", textTransform:"uppercase", marginBottom:"8px", display:"block" };

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, label }) {
    return (
        <div style={{marginTop:"10px"}}>
            <div style={{height:"2px",background:"rgba(200,133,10,0.12)",borderRadius:"1px",overflow:"hidden",marginBottom:"8px"}}>
                <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,#8f5a06,#c8850a)`,borderRadius:"1px",transition:"width 0.4s ease"}}/>
            </div>
            <span style={{fontFamily:FM,fontSize:"9px",color:AMBER,letterSpacing:"0.18em"}}>{label}</span>
        </div>
    );
}

// ── Amber button ──────────────────────────────────────────────────────────────
function AmberBtn({ onClick, disabled, children, style = {} }) {
    return (
        <button onClick={onClick} disabled={disabled} style={{
            width:"100%", padding:"14px 24px", borderRadius:"50px", cursor:disabled?"not-allowed":"pointer",
            background:disabled?"rgba(100,55,5,0.15)":"linear-gradient(to right,#a06008,#c8850a,#d49520,#c8850a,#a06008)",
            border:disabled?"1px solid rgba(100,55,5,0.2)":"1px solid rgba(200,140,30,0.45)",
            color:disabled?"rgba(180,110,15,0.35)":"#fff8e0", fontFamily:FB, fontWeight:800,
            fontSize:"12px", letterSpacing:"0.14em", textTransform:"uppercase",
            boxShadow:disabled?"none":"0 6px 28px rgba(160,90,5,0.40),inset 0 1px 0 rgba(255,230,120,0.25)",
            position:"relative", overflow:"hidden", transition:"all 0.2s", ...style
        }}>
            {!disabled && <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,rgba(255,245,180,0.28),transparent)",animation:"shimmer 2.6s ease-in-out infinite"}}/>}
            <style>{`@keyframes shimmer{0%{transform:translateX(-120%)}100%{transform:translateX(220%)}}`}</style>
            <span style={{position:"relative"}}>{children}</span>
        </button>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EvzonesStudio() {
    const { user } = useAuth();
    const email = user?.email || '';

    const [file, setFile]     = useState(null);
    const [wl, setWl]         = useState('');
    const [phase, setPhase]   = useState('idle');
    const [prog, setProg]     = useState({ pct:0, label:'' });
    const [asset, setAsset]   = useState(null);
    const [hist, setHist]     = useState([]);
    const [err, setErr]       = useState('');
    const [dl, setDl]         = useState(false);

    const onProg = useCallback((p) => setProg({ pct:p.pct??0, label:p.label??'' }), []);

    const handleProcess = async () => {
        if (!file)  return alert('Select a video file first');
        if (!email) return alert('Not logged in');
        setPhase('processing'); setErr(''); setAsset(null);
        try {
            setProg({ pct:0, label:'Initializing…' });
            const processed = await processEvzonesVideo(file, onProg);
            setProg({ pct:93, label:'Uploading to vault…' });
            const sr = await fetch(`${VAULT_URL}/api/save`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ brain:processed.brainB64, segmentCount:processed.segmentCount,
                    whitelist:wl.split(',').map(s=>s.trim()).filter(Boolean), email, fileName:file.name })
            });
            if (!sr.ok) { const e=await sr.json().catch(()=>({})); throw new Error(`${sr.status}: ${e.error||sr.statusText}`); }
            const { assetID, ingestToken } = await sr.json();
            if (!assetID || !ingestToken) throw new Error('Vault returned incomplete response');
            setProg({ pct:96, label:'Building smart asset…' });
            const result = await generateSmartAsset(processed, assetID, VAULT_URL, ingestToken);
            setAsset({ ...result, assetID });
            setPhase('ready');
            setProg({ pct:100, label:'Complete' });
            setHist(h => [{ name:file.name, size:(file.size/1048576).toFixed(1)+' MB', assetID, time:new Date().toLocaleTimeString() }, ...h]);
        } catch(e) { console.error(e); setErr(e.message); setPhase('error'); }
    };

    const handleDownload = async () => {
        if (!asset) return;
        setDl(true);
        try {
            await asset.download((p) => setProg({ pct:Math.round((p.written/p.total)*100), label:`Saving… ${(p.written/1048576).toFixed(0)}MB / ${(p.total/1048576).toFixed(0)}MB` }));
        } catch(e) { if(e.name!=='AbortError') alert('Download failed: '+e.message); }
        finally { setDl(false); }
    };

    const busy = phase==='processing' || dl;

    return (
        <div style={{ padding:"24px 20px 60px", maxWidth:"1160px", margin:"0 auto" }}>

            {/* Page header */}
            <div style={{ marginBottom:"28px" }}>
                <div style={{ fontFamily:FM, fontSize:"9px", color:AMBER, letterSpacing:"0.28em", textTransform:"uppercase", marginBottom:"8px" }}>
                    Operations Console
                </div>
                <h1 style={{ fontFamily:"'Syncopate',sans-serif", fontWeight:700, fontSize:"clamp(20px,4vw,32px)", color:"#f0e8d0", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:"8px" }}>
                    Protect Media
                </h1>
                <p style={{ fontFamily:FB, fontSize:"13px", color:AMBER_DIM, lineHeight:1.7, maxWidth:"600px" }}>
                    Transform your video into a self-defending asset. All processing is client-side.
                    Only the ~20KB init segment is stored in our vault — your video stays on your device.
                </p>
            </div>

            {/* 3-column grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:"16px", marginBottom:"20px" }}>

                {/* Step 1 — Upload */}
                <Panel style={{ padding:"24px" }}>
                    <span style={lbl}>01 / Upload Media</span>
                    <div onClick={()=>!busy&&document.getElementById('fi').click()}
                        style={{ border:`1px dashed rgba(200,133,10,0.18)`, borderRadius:"4px", padding:"28px 16px", textAlign:"center", cursor:busy?"default":"pointer", transition:"border-color 0.2s" }}
                        onMouseEnter={e=>!busy&&(e.currentTarget.style.borderColor='rgba(200,133,10,0.4)')}
                        onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(200,133,10,0.18)')}>
                        <div style={{ fontSize:"2rem", marginBottom:"10px" }}>{file?'📁':'📂'}</div>
                        {file ? (
                            <>
                                <div style={{ fontFamily:FB, fontSize:"13px", fontWeight:600, color:"#f0e8d0", wordBreak:"break-all", marginBottom:"4px" }}>{file.name}</div>
                                <div style={{ fontFamily:FM, fontSize:"10px", color:AMBER }}>{(file.size/1048576).toFixed(1)} MB</div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontFamily:FB, fontSize:"13px", color:AMBER_DIM, marginBottom:"4px" }}>Click to select video</div>
                                <div style={{ fontFamily:FM, fontSize:"9px", color:"rgba(180,110,15,0.3)", letterSpacing:"0.14em" }}>MP4 · MOV · MKV — UP TO 10GB+</div>
                            </>
                        )}
                    </div>
                    <input id="fi" type="file" accept="video/*" style={{ display:"none" }}
                        onChange={e=>{setFile(e.target.files[0]||null);setPhase('idle');setAsset(null);setErr('');}}/>
                </Panel>

                {/* Step 2 — Configure */}
                <Panel style={{ padding:"24px" }}>
                    <span style={lbl}>02 / Configure</span>
                    <div style={{ marginBottom:"16px" }}>
                        <label style={{ fontFamily:FM, fontSize:"9px", color:AMBER_DIM, letterSpacing:"0.2em", textTransform:"uppercase", display:"block", marginBottom:"8px" }}>Allowed Domains</label>
                        <input type="text" placeholder="example.com, news.site" value={wl} disabled={busy}
                            onChange={e=>setWl(e.target.value)}
                            style={{ width:"100%", background:"rgba(5,2,0,0.8)", border:"1px solid rgba(100,55,5,0.30)", borderRadius:"50px", padding:"11px 18px", color:"#d4922e", fontFamily:FB, fontSize:"13px", outline:"none", boxSizing:"border-box", transition:"border-color 0.2s" }}
                            onFocus={e=>e.target.style.borderColor='rgba(180,110,15,0.55)'}
                            onBlur={e=>e.target.style.borderColor='rgba(100,55,5,0.30)'}
                        />
                        <p style={{ fontFamily:FM, fontSize:"9px", color:"rgba(180,110,15,0.35)", marginTop:"6px", letterSpacing:"0.1em" }}>Comma-separated. Unauthorized access triggers an alert email.</p>
                    </div>
                    <div>
                        <label style={{ fontFamily:FM, fontSize:"9px", color:AMBER_DIM, letterSpacing:"0.2em", textTransform:"uppercase", display:"block", marginBottom:"8px" }}>Owner</label>
                        <div style={{ background:"rgba(5,2,0,0.5)", border:"1px solid rgba(100,55,5,0.15)", borderRadius:"50px", padding:"11px 18px", fontFamily:FM, fontSize:"10px", color:"rgba(180,110,15,0.5)", letterSpacing:"0.12em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {email}
                        </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"6px", marginTop:"16px" }}>
                        {[["AES-256","Cipher"],["RSA-2048","Handshake"],["OPFS","Storage"],["SW 206","Safari"]].map(([v,l])=>(
                            <div key={v} style={{ background:"rgba(200,133,10,0.06)", border:"1px solid rgba(200,133,10,0.12)", borderRadius:"4px", padding:"8px 4px", textAlign:"center" }}>
                                <div style={{ fontFamily:FM, fontSize:"8px", fontWeight:700, color:AMBER, letterSpacing:"0.1em" }}>{v}</div>
                                <div style={{ fontFamily:FM, fontSize:"7px", color:AMBER_DIM, marginTop:"3px" }}>{l}</div>
                            </div>
                        ))}
                    </div>
                </Panel>

                {/* Step 3 — Status */}
                <Panel style={{ padding:"24px", display:"flex", flexDirection:"column", gap:"10px" }}>
                    <span style={lbl}>03 / Status</span>
                    {hist.length===0 && phase==='idle' && (
                        <p style={{ fontFamily:FM, fontSize:"9px", color:"rgba(180,110,15,0.3)", letterSpacing:"0.14em" }}>No assets protected this session.</p>
                    )}
                    {hist.map((h,i)=>(
                        <div key={i} style={{ background:"rgba(200,133,10,0.05)", border:"1px solid rgba(200,133,10,0.10)", borderRadius:"4px", padding:"10px 12px" }}>
                            <div style={{ fontFamily:FB, fontSize:"12px", fontWeight:600, color:"#f0e8d0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{h.name}</div>
                            <div style={{ fontFamily:FM, fontSize:"9px", color:AMBER_DIM, marginTop:"3px" }}>{h.size} · {h.time}</div>
                            <code style={{ fontFamily:FM, fontSize:"8px", color:AMBER }}>{h.assetID.slice(0,16)}…</code>
                        </div>
                    ))}
                    {busy && <ProgressBar pct={prog.pct} label={prog.label}/>}
                    {phase==='error' && (
                        <div style={{ background:"rgba(180,50,50,0.08)", border:"1px solid rgba(180,50,50,0.22)", borderRadius:"4px", padding:"10px 12px", fontFamily:FM, fontSize:"9px", color:"#e07070", lineHeight:1.6 }}>
                            ⚠ {err}
                        </div>
                    )}
                </Panel>
            </div>

            {/* Execute */}
            <Panel style={{ padding:"24px", marginBottom:"16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"16px", marginBottom:"20px", flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                        <span style={{ fontSize:"1.6rem" }}>🔑</span>
                        <div>
                            <div style={{ fontFamily:FM, fontSize:"9px", color:AMBER, letterSpacing:"0.2em" }}>BRAIN</div>
                            <div style={{ fontFamily:FM, fontSize:"8px", color:AMBER_DIM }}>Init segment → vault</div>
                        </div>
                    </div>
                    <div style={{ color:AMBER_DIM, fontFamily:FM, fontSize:"14px" }}>→</div>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                        <span style={{ fontSize:"1.6rem" }}>📦</span>
                        <div>
                            <div style={{ fontFamily:FM, fontSize:"9px", color:AMBER, letterSpacing:"0.2em" }}>BRICK</div>
                            <div style={{ fontFamily:FM, fontSize:"8px", color:AMBER_DIM }}>Encrypted body → OPFS</div>
                        </div>
                    </div>
                </div>
                <AmberBtn onClick={handleProcess} disabled={busy||!file||phase==='ready'}>
                    {phase==='processing' ? `⏳  ${prog.label||'Processing…'}` : phase==='ready' ? '✓  Asset Ready — Download Below' : '⚡  Generate Protected Asset'}
                </AmberBtn>
                <p style={{ fontFamily:FM, fontSize:"9px", color:"rgba(180,110,15,0.35)", marginTop:"10px", textAlign:"center", lineHeight:1.7, letterSpacing:"0.08em" }}>
                    FFmpeg runs in-browser · Brick written to OPFS in 8MB chunks · Max RAM: 8MB · No video data leaves your device
                </p>
            </Panel>

            {/* Result */}
            {phase==='ready' && asset && (
                <Panel style={{ padding:"24px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"14px", flexWrap:"wrap" }}>
                        <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:"rgba(200,133,10,0.10)", border:"1px solid rgba(200,133,10,0.28)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <div>
                            <div style={{ fontFamily:"'Syncopate',sans-serif", fontSize:"12px", fontWeight:700, color:"#f0e8d0", letterSpacing:"0.1em", textTransform:"uppercase" }}>Asset Secured</div>
                            <code style={{ fontFamily:FM, fontSize:"9px", color:AMBER }}>{asset.assetID}</code>
                        </div>
                    </div>
                    <div style={{ background:"rgba(200,133,10,0.05)", border:"1px solid rgba(200,133,10,0.12)", borderRadius:"4px", padding:"12px 14px", marginBottom:"16px" }}>
                        <p style={{ fontFamily:FM, fontSize:"9px", color:AMBER_DIM, lineHeight:1.8, letterSpacing:"0.08em" }}>
                            The downloaded <span style={{color:AMBER}}>.html</span> file is a self-contained asset. The encrypted video is appended after the HTML closing tag as raw binary. The player reads its own source via Range requests, caches in OPFS, then the Service Worker serves it with AES-CTR decryption and Safari-compatible 206 range responses.
                        </p>
                    </div>
                    {dl && <ProgressBar pct={prog.pct} label={prog.label}/>}
                    <AmberBtn onClick={handleDownload} disabled={dl}>
                        {dl ? `⏳  Saving…` : `⬇  Download ${asset.fileName}`}
                    </AmberBtn>
                    <p style={{ fontFamily:FM, fontSize:"9px", color:"rgba(180,110,15,0.3)", marginTop:"8px", textAlign:"center", lineHeight:1.6, letterSpacing:"0.08em" }}>
                        Chrome/Edge: streams to disk with zero RAM overhead · Safari: assembles in memory (use Chrome for large files)
                    </p>
                </Panel>
            )}
        </div>
    );
}