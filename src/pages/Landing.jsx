import { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useInView } from "framer-motion";
import { Link } from "react-router-dom";

// ─── Font Injector ─────────────────────────────────────────────────────────────
const FontInjector = () => {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Syncopate:wght@400;700&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
  return null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const AMBER      = "#f5a623";
const AMBER_GOLD = "#d4891a";
const AMBER_DIM  = "rgba(245,166,35,0.50)";
const CREAM      = "#f0e6c8";
const FD         = "'Syncopate', sans-serif";
const FM         = "'Space Mono', monospace";

// ─── useIsMobile ──────────────────────────────────────────────────────────────
const useIsMobile = () => {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    const check = () => setMob(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mob;
};

// ─── Global Styles ────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: #050300;
      font-family: ${FM};
      color: ${CREAM};
      min-height: 100vh;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
    }

    @keyframes shimmer {
      0%   { transform: translateX(-120%); }
      100% { transform: translateX(220%); }
    }
    @keyframes grain {
      0%,100% { transform: translate(0,0);    }
      10%     { transform: translate(-2%,-3%);}
      20%     { transform: translate(3%,2%);  }
      30%     { transform: translate(-1%,4%); }
      40%     { transform: translate(4%,-1%); }
      50%     { transform: translate(-3%,3%); }
      60%     { transform: translate(2%,-4%); }
      70%     { transform: translate(-4%,1%); }
      80%     { transform: translate(1%,-2%); }
      90%     { transform: translate(-2%,4%); }
    }
    @keyframes scanline {
      0%   { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    @keyframes blink {
      0%,100% { opacity: 1; }
      50%     { opacity: 0; }
    }
    @keyframes ticker {
      0%   { transform: translateX(0);    }
      100% { transform: translateX(-50%); }
    }
    @keyframes flicker {
      0%,95%,100% { opacity: 1;    }
      96%         { opacity: 0.82; }
      97%         { opacity: 1;    }
      98%         { opacity: 0.88; }
    }
    @keyframes pulse-border {
      0%,100% { border-color: rgba(245,166,35,0.18); }
      50%     { border-color: rgba(245,166,35,0.36); }
    }

    ::selection { background: rgba(245,166,35,0.22); color: ${CREAM}; }
    ::-webkit-scrollbar       { width: 3px; }
    ::-webkit-scrollbar-track { background: #050300; }
    ::-webkit-scrollbar-thumb { background: rgba(245,166,35,0.28); border-radius: 2px; }

    /* ── Perf strips ── */
    .perf-v { display: flex; }
    .perf-h { display: none; }

    /* ── Layout ── */
    .page-body       { margin-left: 28px; margin-right: 28px; }
    .container       { max-width: 1200px; margin: 0 auto; padding: 0 32px; }
    .features-grid   { grid-template-columns: repeat(4,1fr); }
    .sentinel-outer  { grid-template-columns: 1fr 1fr; }
    .sentinel-cards  { grid-template-columns: 1fr 1fr; }
    .stat-row        { flex-direction: row; flex-wrap: wrap; }
    .cta-btns        { flex-direction: row; flex-wrap: wrap; }
    .nav-counter     { display: flex; }
    .section-pad     { padding-top: 88px;  padding-bottom: 88px; }
    .hero-pad        { padding-top: 88px;  padding-bottom: 88px; }
    .cta-section-pad { padding-top: 80px;  padding-bottom: 80px; }

    /* ── Tablet (769-1024) ── */
    @media (min-width: 769px) and (max-width: 1024px) {
      .features-grid  { grid-template-columns: 1fr 1fr !important; }
      .sentinel-outer { grid-template-columns: 1fr !important; gap: 40px !important; }
      .sentinel-cards { grid-template-columns: 1fr 1fr !important; }
    }

    /* ── Mobile (≤ 768) ── */
    @media (max-width: 768px) {
      .perf-v          { display: none  !important; }
      .perf-h          { display: flex  !important; }
      .page-body       { margin-left: 0 !important; margin-right: 0 !important; }
      .container       { padding: 0 18px !important; }
      .features-grid   { grid-template-columns: 1fr !important; }
      .sentinel-outer  { grid-template-columns: 1fr !important; gap: 36px !important; }
      .sentinel-cards  { grid-template-columns: 1fr 1fr !important; }
      .stat-row        { flex-direction: column !important; gap: 10px !important; }
      .stat-pill       { flex: none !important; width: 100% !important; }
      .cta-btns        { flex-direction: column !important; }
      .cta-btns a      { width: 100% !important; justify-content: center !important; }
      .nav-counter     { display: none !important; }
      .section-pad     { padding-top: 56px !important; padding-bottom: 56px !important; }
      .hero-pad        { padding-top: 52px !important; padding-bottom: 60px !important; }
      .cta-section-pad { padding-top: 52px !important; padding-bottom: 52px !important; }
      .footer-inner    { flex-direction: column !important; text-align: center !important; gap: 8px !important; }
      .footer-dots     { display: none !important; }
      .sentinel-pipeline { font-size: 10px !important; word-break: break-all !important; }
      .section-divider   { display: none !important; }
      .logo1             { font-size: 9px !important; }
      .logo-subtitle     { font-size: 7px !important; padding: 0px 2px !important; }
      .console1          { font-size: 9px !important; padding: 4px 12px !important; }
    }
  `}</style>
);

// ─── Film Grain ───────────────────────────────────────────────────────────────
const FilmGrain = () => (
  <div style={{
    position:"fixed", inset:"-50%", width:"200%", height:"200%",
    pointerEvents:"none", zIndex:9999, opacity:0.03,
    backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    backgroundRepeat:"repeat",
    animation:"grain 0.45s steps(2) infinite",
  }} />
);

// ─── Scanline ─────────────────────────────────────────────────────────────────
const Scanline = () => (
  <div style={{
    position:"fixed", top:0, left:0, right:0, height:"2px",
    background:"linear-gradient(to bottom, transparent, rgba(245,166,35,0.05), transparent)",
    pointerEvents:"none", zIndex:9998,
    animation:"scanline 9s linear infinite",
  }} />
);

// ─── Cursor Blob ──────────────────────────────────────────────────────────────
const CursorBlob = () => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness:40, damping:20 });
  const sy = useSpring(y, { stiffness:40, damping:20 });
  useEffect(() => {
    const h = (e) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, [x, y]);
  return (
    <motion.div style={{
      position:"fixed", top:0, left:0, x:sx, y:sy,
      width:560, height:560, marginLeft:-280, marginTop:-280,
      borderRadius:"50%",
      background:"radial-gradient(circle, rgba(245,166,35,0.07) 0%, transparent 70%)",
      filter:"blur(55px)", pointerEvents:"none", zIndex:1,
    }} />
  );
};

// ─── Vertical Perf ────────────────────────────────────────────────────────────
const VerticalPerf = ({ side }) => (
  <div className="perf-v" style={{
    position:"fixed", top:0, bottom:0, [side]:0, width:"28px", zIndex:50,
    background:"linear-gradient(to bottom, #0a0500, #050300, #0a0500)",
    borderRight: side==="left"  ? "1px solid rgba(245,166,35,0.08)" : "none",
    borderLeft:  side==="right" ? "1px solid rgba(245,166,35,0.08)" : "none",
    flexDirection:"column", alignItems:"center", justifyContent:"space-around",
    padding:"18px 0",
  }}>
    {Array.from({length:22}).map((_,i) => (
      <div key={i} style={{
        width:"12px", height:"9px", borderRadius:"2px", background:"#000",
        boxShadow:"inset 0 1px 3px rgba(0,0,0,1), 0 0 0 1px rgba(50,30,5,0.5)",
        flexShrink:0,
      }} />
    ))}
  </div>
);

// ─── Horizontal Perf (mobile) ─────────────────────────────────────────────────
const HorizPerf = ({ position }) => (
  <div className="perf-h" style={{
    height:"20px", background:"#0a0500",
    borderBottom: position==="top"    ? "1px solid rgba(245,166,35,0.08)" : "none",
    borderTop:    position==="bottom" ? "1px solid rgba(245,166,35,0.08)" : "none",
    alignItems:"center", justifyContent:"space-around", padding:"0 6px",
  }}>
    {Array.from({length:14}).map((_,i) => (
      <div key={i} style={{
        width:"9px", height:"7px", borderRadius:"2px", background:"#000",
        boxShadow:"inset 0 1px 2px rgba(0,0,0,1), 0 0 0 1px rgba(50,30,5,0.5)",
        flexShrink:0,
      }} />
    ))}
  </div>
);

// ─── Film Strip ───────────────────────────────────────────────────────────────
const FilmStrip = () => (
  <div style={{
    height:"26px", background:"#060300",
    borderTop:"1px solid rgba(50,28,5,0.6)", borderBottom:"1px solid rgba(50,28,5,0.6)",
    display:"flex", alignItems:"center", justifyContent:"space-evenly",
    padding:"0 24px", overflow:"hidden",
  }}>
    {Array.from({length:22}).map((_,i) => (
      <div key={i} style={{
        width:"13px", height:"9px", borderRadius:"2px", background:"#010000",
        boxShadow:"inset 0 1px 2px rgba(0,0,0,0.95), 0 0 0 1px rgba(48,28,5,0.45)",
        flexShrink:0,
      }} />
    ))}
  </div>
);

// ─── Ticker ───────────────────────────────────────────────────────────────────
const TickerTape = () => {
  const words = [
    "EVZONES PROTOCOL","SENTINEL DRM v4.1","ZERO BANDWIDTH DIST",
    "GEMMA 2B ON-DEVICE","OPFS PIPELINE","FORENSIC BURN ACTIVE",
    "RSA-2048 HANDSHAKE","WEBGPU ACCELERATED","10GB SINGLE FILE",
    "WASM RUNTIME","UNCOPYABLE ASSETS","CLR-04 BUILD",
  ];
  const tape = [...words,...words].join("  ·  ");
  return (
    <div style={{
      background:"#080400",
      borderTop:"1px solid rgba(245,166,35,0.09)",
      borderBottom:"1px solid rgba(245,166,35,0.09)",
      overflow:"hidden", height:"25px", display:"flex", alignItems:"center",
      position:"relative",
    }}>
      <div style={{
        position:"absolute", left:0, right:0, height:"100%", zIndex:1,
        background:"linear-gradient(to right, #080400 0%, transparent 6%, transparent 94%, #080400 100%)",
      }} />
      <div style={{
        display:"flex", whiteSpace:"nowrap",
        fontFamily:FM, fontSize:"12px", letterSpacing:"0.22em",
        color:"rgba(245,166,35,0.36)", textTransform:"uppercase",
        animation:"ticker 50s linear infinite",
      }}>
        {tape}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tape}
      </div>
    </div>
  );
};

// ─── Corner Brackets ──────────────────────────────────────────────────────────
const CB = ({ color="rgba(245,166,35,0.3)", size=10 }) => (
  <>
    {[
      {top:"7px", left:"7px",   bt:true, bl:true},
      {top:"7px", right:"7px",  bt:true, br:true},
      {bottom:"7px", left:"7px",  bb:true, bl:true},
      {bottom:"7px", right:"7px", bb:true, br:true},
    ].map((p,i) => (
      <div key={i} style={{
        position:"absolute",
        top:p.top, left:p.left, right:p.right, bottom:p.bottom,
        width:`${size}px`, height:`${size}px`,
        borderTop:    p.bt ? `1px solid ${color}` : "none",
        borderBottom: p.bb ? `1px solid ${color}` : "none",
        borderLeft:   p.bl ? `1px solid ${color}` : "none",
        borderRight:  p.br ? `1px solid ${color}` : "none",
        pointerEvents:"none",
      }} />
    ))}
  </>
);

// ─── Icons ────────────────────────────────────────────────────────────────────
const IShield = ({s=24,c=AMBER}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IZap    = ({s=24,c=AMBER}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IFilm   = ({s=24,c=AMBER}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>;
const ILock   = ({s=24,c=AMBER}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IEye    = ({s=24,c=AMBER}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IArrow  = ({s=13}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;

// ─── Reveal ───────────────────────────────────────────────────────────────────
const Reveal = ({ children, delay=0, y=18 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once:true, margin:"-48px" });
  return (
    <motion.div ref={ref}
      initial={{ opacity:0, y }}
      animate={inView ? { opacity:1, y:0 } : {}}
      transition={{ duration:0.68, delay, ease:[0.22,1,0.36,1] }}>
      {children}
    </motion.div>
  );
};

// ─── Film Frame Card ──────────────────────────────────────────────────────────
const FilmFrame = ({ serial, icon, title, desc, index }) => {
  const [hov, setHov] = useState(false);
  return (
    <Reveal delay={index * 0.07}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          position:"relative", overflow:"hidden",
          background: hov
            ? "linear-gradient(160deg,#110800,#0b0500)"
            : "linear-gradient(160deg,#0d0600,#070300)",
          border:`1px solid ${hov ? "rgba(245,166,35,0.32)" : "rgba(68,38,5,0.45)"}`,
          transition:"all 0.3s",
          boxShadow: hov ? "0 0 36px rgba(245,166,35,0.07)" : "none",
          animation:`flicker ${10+index*2.1}s infinite`,
          animationDelay:`${index*2.0}s`,
        }}>
        <CB color={hov ? "rgba(245,166,35,0.55)" : "rgba(65,38,5,0.65)"} />

        {/* Top strip */}
        <div style={{
          background:"#060300", borderBottom:"1px solid rgba(48,26,5,0.65)",
          padding:"6px 12px", display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <span style={{
            fontFamily:FM, fontSize:"12px",
            color: hov ? AMBER : "rgba(245,166,35,0.36)",
            letterSpacing:"0.22em", textTransform:"uppercase",
            transition:"color 0.3s",
          }}>{serial}</span>
          <div style={{ display:"flex", gap:"3px" }}>
            {[0,1,2,3,4].map(j => (
              <div key={j} style={{
                width:"3px", height:"3px", borderRadius:"50%",
                background: j===0 ? AMBER : "rgba(245,166,35,0.16)",
              }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:"20px 16px 24px" }}>
          <div style={{ marginBottom:"12px", opacity:hov?1:0.62, transition:"opacity 0.3s" }}>
            {icon}
          </div>
          <h3 style={{
            fontFamily:FD, fontSize:"11px", fontWeight:700,
            color:CREAM, letterSpacing:"0.17em", textTransform:"uppercase",
            marginBottom:"10px", lineHeight:1.5,
          }}>{title}</h3>
          <p style={{
            fontFamily:FM, fontSize:"12px",
            color:"rgba(200,175,120,0.58)", lineHeight:1.85, letterSpacing:"0.02em",
          }}>{desc}</p>
        </div>

        {/* Bottom strip */}
        <div style={{
          background:"#060300", borderTop:"1px solid rgba(48,26,5,0.65)",
          padding:"4px 12px",
          fontFamily:FM, fontSize:"11px",
          color:"rgba(245,166,35,0.16)", letterSpacing:"0.13em", textTransform:"uppercase",
        }}>
          EVZONES / PROTOCOL / {String(index+1).padStart(4,"0")}
        </div>
      </div>
    </Reveal>
  );
};

// ─── Sentinel Card ────────────────────────────────────────────────────────────
const SentinelCard = ({ label, value, desc, delay }) => {
  const [hov, setHov] = useState(false);
  return (
    <Reveal delay={delay}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          position:"relative", padding:"16px 14px",
          background: hov ? "rgba(245,166,35,0.04)" : "transparent",
          border:`1px solid ${hov ? "rgba(245,166,35,0.28)" : "rgba(68,38,5,0.38)"}`,
          transition:"all 0.25s", cursor:"default",
        }}>
        <CB color={hov ? "rgba(245,166,35,0.5)" : "rgba(68,38,5,0.5)"} size={8} />
        <div style={{
          fontFamily:FM, fontSize:"12px", color:AMBER,
          letterSpacing:"0.24em", textTransform:"uppercase", marginBottom:"6px",
        }}>{label}</div>
        <div style={{
          fontFamily:FD, fontSize:"14px", fontWeight:700,
          color:CREAM, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"7px",
          wordBreak:"break-word",
        }}>{value}</div>
        <div style={{
          fontFamily:FM, fontSize:"12px",
          color:"rgba(200,175,120,0.52)", lineHeight:1.75, letterSpacing:"0.01em",
        }}>{desc}</div>
      </div>
    </Reveal>
  );
};

// ─── CTA Button ───────────────────────────────────────────────────────────────
const CTABtn = ({ to, children, primary=true, wide=false }) => (
  <Link to={to} style={{
    display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"9px",
    padding:"13px 24px",
    width: wide ? "100%" : undefined,
    position:"relative", overflow:"hidden",
    background: primary
      ? `linear-gradient(to right, ${AMBER_GOLD}, ${AMBER}, #f5c842, ${AMBER}, ${AMBER_GOLD})`
      : "transparent",
    border: primary
      ? "1px solid rgba(245,200,66,0.4)"
      : "1px solid rgba(245,166,35,0.25)",
    fontFamily:FM, fontSize:"12px", fontWeight:700,
    letterSpacing:"0.18em", textTransform:"uppercase",
    color: primary ? "#1a0800" : AMBER_DIM,
    textDecoration:"none",
    boxShadow: primary
      ? "0 6px 32px rgba(212,137,26,0.32), inset 0 1px 0 rgba(255,240,120,0.3)"
      : "none",
    WebkitTapHighlightColor:"transparent",
  }}>
    {primary && (
      <div style={{
        position:"absolute", inset:0,
        background:"linear-gradient(90deg,transparent,rgba(255,255,200,0.36),transparent)",
        animation:"shimmer 2.8s ease-in-out infinite 0.8s",
      }} />
    )}
    <span style={{ position:"relative" }}>{children}</span>
    {primary && <span style={{ position:"relative" }}><IArrow s={12} /></span>}
  </Link>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Landing() {
  const [scrolled, setScrolled]     = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    window.addEventListener("scroll", onScroll, { passive:true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setFrameCount(c => (c+1) % 99999), 42);
    return () => clearInterval(id);
  }, []);

  const FEATURES = [
    { serial:"SNTNL_01", icon:<IShield s={26}/>, title:"Secure Playback",   desc:"The video is split into encrypted body (the Brick) and metadata brain. The brain lives in a remote vault; without it, the file is useless. Revoke access anytime — all distributed copies die instantly." },
    { serial:"SNTNL_02", icon:<IFilm   s={26}/>, title:"OPFS Pipeline",  desc:"The HTML file carries the encrypted 10GB payload. Your browser moves it into Origin Private File System (OPFS) in chunks — no RAM overload. Streamed directly, no CDN needed." },
    { serial:"SNTNL_03", icon:<IZap    s={26}/>, title:"Forensic Watermarking",  desc:"Each viewer gets a unique, invisible ID baked into the video frames. Even a screen recording or camera capture can be traced back to the leaker. No performance hit." },
    { serial:"SNTNL_04", icon:<IEye    s={26}/>, title:"Gemma AI Guard", desc:"Google's Gemma 2B model runs locally via WebGPU. It watches for screen‑recording software, bots, or suspicious behavior — and kills the stream instantly. No data leaves your device." },
  ];

  const SENTINEL_TECH = [
    { label:"Core Runtime",   value:"WebAssembly + FFmpeg",  desc:"Encryption and slicing happen locally in your browser. No video data ever touches our servers." },
    { label:"Storage Layer", value:"OPFS (Origin Private FS)", desc:"The 10GB encrypted brick lives inside your browser's virtual file system. Fast, sandboxed, DevTools‑invisible." },
    { label:"Key Exchange",  value:"RSA + AES‑CTR", desc:"One‑time key pair per session. Server calculates segment keys on‑the‑fly using HMAC — nothing stored." },
    { label:"AI Guard",      value:"Gemma 2B via WebGPU", desc:"Runs locally. Detects screen‑recording, automation, or abnormal viewing. Kills stream on threat." },
  ];

  return (
    <>
      <FontInjector />
      <GlobalStyles />
      <FilmGrain />
      <Scanline />
      {!isMobile && <CursorBlob />}

      <VerticalPerf side="left" />
      <VerticalPerf side="right" />

      {/* ── Page wrapper: perf margin on desktop, none on mobile ── */}
      <div className="page-body" style={{ position:"relative", zIndex:2, minHeight:"100vh" }}>

        <HorizPerf position="top" />

        {/* ── NAV ── */}
        <header style={{
          position:"sticky", top:0, zIndex:100,
          background: scrolled ? "rgba(4,2,0,0.97)" : "transparent",
          borderBottom: scrolled ? "1px solid rgba(245,166,35,0.1)" : "1px solid transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
          transition:"all 0.35s ease",
        }}>
          <div className="container" style={{
            height:"56px", display:"flex",
            alignItems:"center", justifyContent:"space-between",
          }}>
            {/* Logo */}
            <div style={{ display:"flex", alignItems:"center", gap:"8px", flexShrink:0, minWidth:0 }}>
              <IShield s={15} c={AMBER} />
              <span className="logo1" style={{
                fontFamily:FD, fontSize:"25px", fontWeight:700,
                color:CREAM, letterSpacing:"0.22em", textTransform:"uppercase",
                whiteSpace:"nowrap",
              }}>Evzones</span>
              <span className="logo-subtitle" style={{
                fontFamily:FM, fontSize:"11px", color:AMBER,
                letterSpacing:"0.14em", textTransform:"uppercase",
                padding:"2px 5px", border:"1px solid rgba(245,166,35,0.28)",
                flexShrink:0, whiteSpace:"nowrap",
              }}>Protocol</span>
            </div>

            {/* Right */}
            <div style={{ display:"flex", alignItems:"center", gap:"12px", flexShrink:0 }}>
              <div className="nav-counter" style={{
                alignItems:"center", gap:"6px",
                fontFamily:FM, fontSize:"13px",
                color:"rgba(245,166,35,0.32)", letterSpacing:"0.12em",
              }}>
                <div style={{
                  width:"7px", height:"7px", borderRadius:"50%",
                  background:AMBER, animation:"blink 1.2s ease infinite", flexShrink:0,
                }} />
                {String(frameCount).padStart(5,"0")}
              </div>
              <Link className="console1" to="/login" style={{
                display:"inline-flex", alignItems:"center", gap:"6px",
                padding:"9px 15px",
                border:"1px solid rgba(245,166,35,0.32)",
                background:"rgba(245,166,35,0.06)",
                fontFamily:FM, fontSize:"14px", fontWeight:700,
                letterSpacing:"0.14em", textTransform:"uppercase",
                color:AMBER, textDecoration:"none",
                WebkitTapHighlightColor:"transparent",
                flexShrink:0, whiteSpace:"nowrap",
              }}>
                Console <IArrow s={9} />
              </Link>
            </div>
          </div>
        </header>

        <FilmStrip />
        <TickerTape />

        {/* ── HERO ── */}
        <section className="hero-pad" style={{ position:"relative", overflow:"hidden" }}>
          {/* Grid bg */}
          <div style={{
            position:"absolute", inset:0, pointerEvents:"none",
            backgroundImage:`linear-gradient(rgba(245,166,35,0.02) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(245,166,35,0.02) 1px, transparent 1px)`,
            backgroundSize:"50px 50px",
          }} />
          {/* Radial glow */}
          <div style={{
            position:"absolute", inset:0, pointerEvents:"none",
            background:"radial-gradient(ellipse at 50% 75%, rgba(245,166,35,0.07) 0%, transparent 58%)",
          }} />

          <div className="container" style={{ position:"relative" }}>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:1.1}}>

              {/* Tag */}
              <motion.div
                initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}}
                transition={{duration:0.6,delay:0.2}}>
                <div style={{
                  display:"flex", alignItems:"center", gap:"7px",
                  marginBottom:"26px", flexWrap:"wrap",
                  fontFamily:FM, fontSize:"12px",
                  color:AMBER_DIM, letterSpacing:"0.22em", textTransform:"uppercase",
                  lineHeight:1.8,
                }}>
                  <ILock s={8} c={AMBER_DIM} />
                  <span>EVZONES PROTOCOL / SENTINEL v4.1 /</span>
                  <span style={{ color:AMBER, animation:"blink 2.2s infinite" }}>ACTIVE</span>
                </div>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{opacity:0,y:28}} animate={{opacity:1,y:0}}
                transition={{duration:0.9,delay:0.32,ease:[0.22,1,0.36,1]}}
                style={{
                  fontFamily:FD, fontWeight:700,
                  fontSize:"clamp(28px, 9vw, 86px)",
                  letterSpacing:"0.04em", lineHeight:1.0,
                  textTransform:"uppercase",
                  wordBreak:"break-word", overflowWrap:"break-word",
                  maxWidth:"880px",
                }}>
                <span style={{
                  background:`linear-gradient(130deg, #fff 0%, ${AMBER} 48%, #ffe8aa 72%, ${AMBER} 100%)`,
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                  backgroundClip:"text",
                }}>
                  Developing<br />The
                </span>
                <br />
                <span style={{
                  background:`linear-gradient(130deg, ${AMBER} 0%, #f5c842 42%, ${AMBER} 72%, #c8730a 100%)`,
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                  backgroundClip:"text",
                }}>
                  Uncopyable.
                </span>
              </motion.h1>

              {/* Subhead */}
              <motion.p
                initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
                transition={{duration:0.8,delay:0.52}}
                style={{
                  marginTop:"22px", fontFamily:FM, fontSize:"12px",
                  color:"rgba(200,175,120,0.68)", lineHeight:1.95,
                  maxWidth:"460px", letterSpacing:"0.03em",
                }}>
                One HTML file holds your entire 10GB video — encrypted, self-playing,
and bandwidth-free. The viewer downloads once, and the vault holds the key.
No servers. No streaming bills.
              </motion.p>

              {/* Stats */}
              <motion.div
                className="stat-row"
                initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
                transition={{duration:0.8,delay:0.64}}
                style={{ display:"flex", gap:"10px", marginTop:"30px" }}>
                {[
                  { val:"10GB+", lbl:"Per HTML File" },
                  { val:"$0",    lbl:"Monthly Bandwidth" },
                  { val:"2B",    lbl:"Gemma AI Guard" },
                ].map(({ val, lbl }) => (
                  <div key={val} className="stat-pill" style={{
                    position:"relative", padding:"11px 16px",
                    border:"1px solid rgba(245,166,35,0.2)",
                    background:"rgba(245,166,35,0.04)",
                    flex:"1 1 80px",
                  }}>
                    <CB color="rgba(245,166,35,0.26)" size={7} />
                    <div style={{
                      fontFamily:FD, fontSize:"clamp(15px,4vw,21px)", fontWeight:700,
                      color:AMBER, letterSpacing:"0.08em",
                    }}>{val}</div>
                    <div style={{
                      fontFamily:FM, fontSize:"11px",
                      color:AMBER_DIM, letterSpacing:"0.14em",
                      textTransform:"uppercase", marginTop:"3px",
                    }}>{lbl}</div>
                  </div>
                ))}
              </motion.div>

              {/* CTAs */}
              <motion.div
                className="cta-btns"
                initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
                transition={{duration:0.8,delay:0.78}}
                style={{ marginTop:"32px", display:"flex", gap:"12px" }}>
                <CTABtn to="/login" primary>Get Clearance</CTABtn>
                <CTABtn to="/docs"  primary={false}>View Demo</CTABtn>
              </motion.div>

            </motion.div>
          </div>
        </section>

        <TickerTape />
        <FilmStrip />

        {/* ── NEGATIVE REEL ── */}
        <section className="section-pad">
          <div className="container">
            <Reveal>
              <div style={{ marginBottom:"40px" }}>
                <div style={{
                  fontFamily:FM, fontSize:"12px", color:AMBER,
                  letterSpacing:"0.26em", textTransform:"uppercase",
                  marginBottom:"11px",
                  display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap",
                }}>
                  <div style={{ width:"24px", height:"1px", background:AMBER_DIM, flexShrink:0 }} />
                  The Negative Reel · Frame Archive
                  <div className="section-divider" style={{ width:"24px", height:"1px", background:AMBER_DIM, flexShrink:0 }} />
                </div>
                <h2 style={{
                  fontFamily:FD, fontSize:"clamp(18px,5.5vw,38px)", fontWeight:700,
                  color:CREAM, letterSpacing:"0.1em", textTransform:"uppercase",
                  lineHeight:1.1,
                }}>
                  Protocol&nbsp;<span style={{ color:AMBER }}>Layers.</span>
                </h2>
              </div>
            </Reveal>

            <div className="features-grid" style={{ display:"grid", gap:"2px" }}>
              {FEATURES.map((f,i) => (
                <FilmFrame key={f.serial} {...f} index={i} />
              ))}
            </div>
          </div>
        </section>

        <FilmStrip />

        {/* ── SENTINEL STACK ── */}
        <section className="section-pad">
          <div className="container">
            <div className="sentinel-outer" style={{ display:"grid", gap:"48px", alignItems:"start" }}>

              {/* Left text */}
              <Reveal>
                <div>
                  <div style={{
                    fontFamily:FM, fontSize:"12px", color:AMBER,
                    letterSpacing:"0.26em", textTransform:"uppercase",
                    marginBottom:"11px",
                    display:"flex", alignItems:"center", gap:"10px",
                  }}>
                    <div style={{ width:"20px", height:"1px", background:AMBER_DIM, flexShrink:0 }} />
                    Sentinel Stack
                  </div>
                  <h2 style={{
                    fontFamily:FD, fontSize:"clamp(18px,5vw,34px)", fontWeight:700,
                    color:CREAM, letterSpacing:"0.08em", textTransform:"uppercase",
                    lineHeight:1.15, marginBottom:"18px",
                  }}>
                    Fully Client‑Side.<br />
                    <span style={{ color:AMBER }}>You Own Your Data.</span>
                  </h2>
                  <p style={{
                    fontFamily:FM, fontSize:"11px",
                    color:"rgba(200,175,120,0.6)", lineHeight:1.9,
                    letterSpacing:"0.02em", maxWidth:"420px",
                  }}>
                   Everything runs inside your browser — FFmpeg.wasm for encryption,
                    OPFS for storage, WebCrypto for decryption. The only server
                    is a lightweight vault that stores keys (not videos).
                  </p>

                  {/* Pipeline */}
                  <div style={{ marginTop:"26px", display:"flex", gap:"10px", alignItems:"flex-start" }}>
                    <div style={{
                      width:"2px", minHeight:"40px",
                      background:`linear-gradient(to bottom, ${AMBER}, transparent)`,
                      flexShrink:0, marginTop:"2px",
                    }} />
                    <div className="sentinel-pipeline" style={{
                      fontFamily:FM, fontSize:"12px",
                      color:AMBER_DIM, lineHeight:2.1, letterSpacing:"0.06em",
                    }}>
                      Wasm Decode → WebGPU Render → OPFS Vault → RSA Token → Gemma Guard → Forensic Stamp → Session Destroy
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Right cards */}
              <div className="sentinel-cards" style={{ display:"grid", gap:"2px" }}>
                {SENTINEL_TECH.map((t,i) => (
                  <SentinelCard key={t.label} {...t} delay={i*0.06} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <FilmStrip />

        {/* ── CTA BANNER ── */}
        <section className="cta-section-pad">
          <div className="container">
            <Reveal>
              <div style={{
                position:"relative", overflow:"hidden",
                border:"1px solid rgba(245,166,35,0.18)",
                background:"linear-gradient(160deg, #0d0700 0%, #070300 100%)",
                padding:"clamp(32px,7vw,72px) clamp(18px,5vw,60px)",
                textAlign:"center",
                animation:"pulse-border 4s ease infinite",
              }}>
                <CB color="rgba(245,166,35,0.4)" size={14} />
                <div style={{
                  position:"absolute", inset:0, pointerEvents:"none",
                  background:"radial-gradient(ellipse at 50% 50%, rgba(245,166,35,0.07) 0%, transparent 62%)",
                }} />
                <div style={{
                  position:"absolute", inset:0, pointerEvents:"none",
                  background:"repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(245,166,35,0.011) 4px)",
                }} />

                <div style={{ position:"relative" }}>
                  <div style={{
                    fontFamily:FM, fontSize:"11px", color:AMBER,
                    letterSpacing:"0.26em", textTransform:"uppercase",
                    marginBottom:"14px",
                  }}>
                    Virtual Command Center · Clearance Required
                  </div>
                  <h2 style={{
                    fontFamily:FD, fontSize:"clamp(20px,6vw,50px)", fontWeight:700,
                    color:CREAM, letterSpacing:"0.08em", textTransform:"uppercase",
                    lineHeight:1.1, marginBottom:"12px",
                    textShadow:"0 0 80px rgba(245,166,35,0.18)",
                  }}>
                    Secure The<br /><span style={{ color:AMBER }}>Footage.</span>
                  </h2>
                  <p style={{
                    fontFamily:FM, fontSize:"11px",
                    color:"rgba(200,175,120,0.6)", lineHeight:1.9,
                    maxWidth:"380px", margin:"0 auto 28px", letterSpacing:"0.02em",
                  }}>
                    10GB assets. Single-file distribution. $0 bandwidth costs.
                    Gemma 2B behavioral security. Deploy in minutes.
                  </p>
                  <CTABtn to="/login" primary>Enter Sentinel Console</CTABtn>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <FilmStrip />

        {/* ── FOOTER ── */}
        <footer style={{ borderTop:"1px solid rgba(65,38,5,0.3)" }}>
          <div className="container footer-inner" style={{
            paddingTop:"20px", paddingBottom:"20px",
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:"10px",
          }}>
            <div style={{
              fontFamily:FM, fontSize:"11px",
              color:"rgba(245,166,35,0.26)", letterSpacing:"0.13em", textTransform:"uppercase",
            }}>
              © 2026 Evzones Protocol · All Rights Reserved
            </div>
            <div className="footer-dots" style={{ display:"flex", gap:"4px" }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{
                  width:"3px", height:"3px", borderRadius:"50%",
                  background: i===2 ? AMBER : "rgba(245,166,35,0.18)",
                }} />
              ))}
            </div>
            <div style={{
              fontFamily:FM, fontSize:"11px",
              color:"rgba(245,166,35,0.26)", letterSpacing:"0.13em", textTransform:"uppercase",
            }}>
              SENTINEL v4.1 · CLR-04
            </div>
          </div>
        </footer>

        <HorizPerf position="bottom" />
      </div>
    </>
  );
}