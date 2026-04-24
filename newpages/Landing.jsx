import { useState, useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Link } from "react-router-dom";

// ─── Font Injector ─────────────────────────────────────────────────────────────
const FontInjector = () => {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Syncopate:wght@400;700&family=DM+Sans:wght@300;400;500;600;700&family=Courier+Prime:wght@400;700&display=swap');`;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  return null;
};

// ─── Global Styles ─────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: radial-gradient(ellipse at 50% 0%, #2a1200 0%, #130800 35%, #080400 70%, #030200 100%);
      font-family: 'DM Sans', sans-serif;
      color: #f0e8d0;
      min-height: 100vh;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes shimmer {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(220%); }
    }
    @keyframes gridScroll {
      0% { background-position: 0 0; }
      100% { background-position: 40px 40px; }
    }
    ::selection { background: rgba(200,133,10,0.3); color: #f0e8d0; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: #030200; }
    ::-webkit-scrollbar-thumb { background: rgba(200,133,10,0.3); border-radius: 2px; }
  `}</style>
);

// ─── Cursor Blob ──────────────────────────────────────────────────────────────
const CursorBlob = () => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 55, damping: 18 });
  const springY = useSpring(y, { stiffness: 55, damping: 18 });

  useEffect(() => {
    const handleMouseMove = (e) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [x, y]);

  return (
    <motion.div style={{
      position: "fixed", top: 0, left: 0, x: springX, y: springY,
      width: 700, height: 600, marginLeft: -350, marginTop: -300,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(200,133,10,0.10) 0%, transparent 70%)",
      filter: "blur(80px)", pointerEvents: "none", zIndex: 1,
    }} />
  );
};

// ─── Blueprint Grid Background ─────────────────────────────────────────────────
const BlueprintGrid = () => (
  <div style={{
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage: `
      linear-gradient(rgba(200,133,10,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(200,133,10,0.04) 1px, transparent 1px)
    `,
    backgroundSize: "40px 40px",
    animation: "gridScroll 8s linear infinite",
  }} />
);

// ─── Corner Brackets ───────────────────────────────────────────────────────────
const CornerBrackets = ({ color = "rgba(180,110,15,0.45)", size = 14 }) => (
  <>
    {[
      { top: "10px", left: "10px", borderTop: true, borderLeft: true },
      { top: "10px", right: "10px", borderTop: true, borderRight: true },
      { bottom: "10px", left: "10px", borderBottom: true, borderLeft: true },
      { bottom: "10px", right: "10px", borderBottom: true, borderRight: true },
    ].map((pos, i) => (
      <div key={i} style={{
        position: "absolute",
        top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom,
        width: `${size}px`, height: `${size}px`,
        borderTop: pos.borderTop ? `1.5px solid ${color}` : "none",
        borderBottom: pos.borderBottom ? `1.5px solid ${color}` : "none",
        borderLeft: pos.borderLeft ? `1.5px solid ${color}` : "none",
        borderRight: pos.borderRight ? `1.5px solid ${color}` : "none",
        pointerEvents: "none",
      }} />
    ))}
  </>
);

// ─── Panel ─────────────────────────────────────────────────────────────────────
const Panel = ({ children, style = {}, hover = false }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        position: "relative",
        background: "linear-gradient(160deg, rgba(18,8,2,0.85) 0%, rgba(10,5,1,0.92) 100%)",
        border: `1px solid ${hovered ? "rgba(200,133,10,0.35)" : "rgba(120,65,5,0.28)"}`,
        borderRadius: "4px",
        transition: "border-color 0.25s, box-shadow 0.25s",
        boxShadow: hovered
          ? "0 0 30px rgba(200,133,10,0.10), inset 0 1px 0 rgba(200,133,10,0.06)"
          : "inset 0 1px 0 rgba(255,255,255,0.02)",
        ...style,
      }}>
      <CornerBrackets />
      {children}
    </div>
  );
};

// ─── Shared style helpers ─────────────────────────────────────────────────────
const AMBER = "#c8850a";
const AMBER_DIM = "rgba(180,110,15,0.55)";
const FONT_DISPLAY = "'Syncopate', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";
const FONT_MONO = "'Courier Prime', monospace";

const labelStyle = {
  fontFamily: FONT_MONO,
  fontSize: "10px",
  color: AMBER,
  letterSpacing: "0.28em",
  textTransform: "uppercase",
  marginBottom: "8px",
};

const container = {
  maxWidth: "1160px",
  margin: "0 auto",
  padding: "0 24px",
};

// ─── Film strip ────────────────────────────────────────────────────────────────
const FilmStrip = ({ horizontal = false }) => {
  const holes = horizontal
    ? Array.from({ length: 14 })
    : Array.from({ length: 8 });
  return horizontal ? (
    <div style={{
      height: "28px",
      background: "linear-gradient(90deg, #120800 0%, #1a0d04 50%, #120800 100%)",
      borderTop: "1px solid rgba(80,40,5,0.4)",
      borderBottom: "1px solid rgba(80,40,5,0.4)",
      display: "flex", alignItems: "center", justifyContent: "space-evenly",
      padding: "0 12px",
    }}>
      {holes.map((_, i) => (
        <div key={i} style={{
          width: "14px", height: "10px", borderRadius: "2px", background: "#060300",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.9), 0 0 0 1px rgba(60,30,5,0.4)",
          flexShrink: 0,
        }} />
      ))}
    </div>
  ) : null;
};

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Landing() {
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <FontInjector />
      <GlobalStyles />
      <CursorBlob />

      <div style={{ position: "relative", zIndex: 2, minHeight: "100vh" }}>

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          background: navScrolled
            ? "rgba(6,3,1,0.92)"
            : "rgba(6,3,1,0.60)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(120,65,5,0.28)",
          transition: "background 0.3s",
        }}>
          <div style={{ ...container, display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
            {/* Logo */}
            <Link to="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
              <div style={{
                width: "36px", height: "36px", display: "grid", placeItems: "center",
                borderRadius: "4px",
                border: "1px solid rgba(200,133,10,0.40)",
                background: "rgba(200,133,10,0.08)",
                boxShadow: "0 0 20px rgba(200,133,10,0.12)",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: "10px", fontWeight: 700, color: AMBER, letterSpacing: "0.22em", textTransform: "uppercase" }}>
                  EVZONES PROTOCOL
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: "9px", color: AMBER_DIM, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                  Smart Media Infrastructure
                </div>
              </div>
            </Link>



            {/* CTA button */}
            <Link to="/app" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "10px 20px", borderRadius: "50px",
              background: "linear-gradient(145deg, #b87010, #8f5a06)",
              border: "1px solid rgba(200,133,10,0.45)",
              fontFamily: FONT_BODY, fontSize: "11px", fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#fff8e8", textDecoration: "none",
              boxShadow: "0 4px 18px rgba(160,90,5,0.35), inset 0 1px 0 rgba(255,220,120,0.2)",
              position: "relative", overflow: "hidden",
              transition: "transform 0.2s",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(90deg,transparent,rgba(255,245,180,0.25),transparent)",
                animation: "shimmer 2.8s ease-in-out infinite",
              }} />
              Open Console
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </header>

        {/* ── Film strip ──────────────────────────────────────────────────── */}
        <FilmStrip horizontal />

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section style={{ position: "relative", overflow: "hidden" }}>
          <BlueprintGrid />
          {/* amber radial glow */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse at 50% 0%, rgba(200,133,10,0.09) 0%, transparent 65%)",
          }} />

          <div style={{ ...container, position: "relative", paddingTop: "80px", paddingBottom: "80px" }}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>

              {/* Badge */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                padding: "6px 14px", borderRadius: "50px",
                border: "1px solid rgba(200,133,10,0.30)",
                background: "rgba(200,133,10,0.08)",
                fontFamily: FONT_MONO, fontSize: "10px", color: AMBER,
                letterSpacing: "0.22em", textTransform: "uppercase",
                marginBottom: "28px",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Digital Asset Protection Platform
              </div>

              {/* Headline */}
              <h1 style={{
                fontFamily: FONT_DISPLAY, fontWeight: 700,
                fontSize: "clamp(36px,6vw,72px)",
                color: "#f0e8d0", letterSpacing: "0.08em",
                lineHeight: 1.1, maxWidth: "820px",
                textShadow: "0 0 80px rgba(200,133,10,0.20), 0 2px 20px rgba(200,133,10,0.10)",
                textTransform: "uppercase",
              }}>
                Evzones{" "}
                <span style={{ color: AMBER, textShadow: "0 0 40px rgba(200,133,10,0.45)" }}>
                  Protocol
                </span>
                .
              </h1>

              <p style={{
                marginTop: "20px",
                fontFamily: FONT_BODY, fontSize: "17px", fontWeight: 400,
                color: AMBER_DIM, lineHeight: 1.7, maxWidth: "560px",
              }}>
                Project Evzones Protocol transforms ordinary video into smart protected assets — orchestrated through ingestion,
                vault, packaging, playback validation, and forensic observability.
              </p>

              {/* CTA row */}
              <div style={{ marginTop: "36px", display: "flex", flexWrap: "wrap", gap: "12px" }}>
                <Link to="/app" style={{
                  display: "inline-flex", alignItems: "center", gap: "10px",
                  padding: "14px 28px", borderRadius: "50px",
                  background: "linear-gradient(to right, #a06008, #c8850a, #d49520, #c8850a, #a06008)",
                  border: "1px solid rgba(200,140,30,0.45)",
                  fontFamily: FONT_BODY, fontSize: "13px", fontWeight: 800,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "#fff8e0", textDecoration: "none", position: "relative", overflow: "hidden",
                  boxShadow: "0 8px 32px rgba(160,90,5,0.45), inset 0 1px 0 rgba(255,230,120,0.25)",
                  textShadow: "0 1px 4px rgba(60,30,0,0.6)",
                }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(90deg,transparent,rgba(255,245,180,0.30),transparent)",
                    animation: "shimmer 2.6s ease-in-out infinite 1.2s",
                  }} />
                  Get Started
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>

              </div>
            </motion.div>

          </div>
        </section>

        {/* ── Film strip ──────────────────────────────────────────────────── */}
        <FilmStrip horizontal />

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <section style={{ ...container, paddingTop: "80px", paddingBottom: "80px" }}>
          <Panel style={{ padding: "64px 56px", textAlign: "center", overflow: "hidden" }}>
            {/* background radial glow */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "radial-gradient(ellipse at 50% 50%, rgba(200,133,10,0.08) 0%, transparent 70%)",
            }} />
            {/* scanline overlay */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(200,133,10,0.014) 4px)",
            }} />

            <div style={{ position: "relative" }}>
              <div style={labelStyle}>Virtual Workspace</div>
              <h2 style={{
                fontFamily: FONT_DISPLAY, fontSize: "clamp(26px,4vw,52px)", fontWeight: 700,
                color: "#f0e8d0", letterSpacing: "0.08em", textTransform: "uppercase",
                lineHeight: 1.1, marginBottom: "14px",
                textShadow: "0 0 60px rgba(200,133,10,0.25)",
              }}>
                Step into the command center.
              </h2>
              <p style={{ fontFamily: FONT_BODY, fontSize: "15px", color: AMBER_DIM, maxWidth: "480px", margin: "0 auto 32px", lineHeight: 1.7 }}>
                Protect your content with Evzones Protocol.
              </p>
              <Link to="/app" style={{
                display: "inline-flex", alignItems: "center", gap: "10px",
                padding: "16px 36px", borderRadius: "50px",
                background: "linear-gradient(to right, #a06008, #c8850a, #d49520, #c8850a, #a06008)",
                border: "1px solid rgba(200,140,30,0.45)",
                fontFamily: FONT_BODY, fontSize: "13px", fontWeight: 800,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "#fff8e0", textDecoration: "none", position: "relative", overflow: "hidden",
                boxShadow: "0 8px 40px rgba(160,90,5,0.50), inset 0 1px 0 rgba(255,230,120,0.25)",
                textShadow: "0 1px 4px rgba(60,30,0,0.6)",
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg,transparent,rgba(255,245,180,0.30),transparent)",
                  animation: "shimmer 2.6s ease-in-out infinite",
                }} />
                Open Evzones Protocol
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>
          </Panel>
        </section>

        {/* ── Film strip ──────────────────────────────────────────────────── */}
        <FilmStrip horizontal />

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{
          borderTop: "1px solid rgba(120,65,5,0.28)",
        }}>
          <div style={{
            ...container,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: "28px", paddingBottom: "28px",
          }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: "10px", color: AMBER_DIM, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              © 2026 Project Evzones Protocol · Operations Console v1.0
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: "4px", height: "4px", borderRadius: "50%", background: AMBER_DIM }} />
              ))}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: "10px", color: AMBER_DIM, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              CLR-04 · BLUEPRINT BUILD
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
