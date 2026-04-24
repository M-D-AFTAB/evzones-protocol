import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";

// ─── Font Injector ────────────────────────────────────────────────────────────
const FontInjector = () => {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Syncopate:wght@400;700&family=DM+Sans:wght@300;400;500;600;700&family=Courier+Prime:wght@400;700&display=swap');`;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  return null;
};

// ─── Soft Camera Flash (card-contained amber glow) ────────────────────────────
const CameraFlash = ({ active, onDone }) => (
  <AnimatePresence>
    {active && (
      <>
        <motion.div key="glow" style={{
          position: "absolute", inset: 0, zIndex: 51, pointerEvents: "none", borderRadius: "inherit",
          background: "radial-gradient(ellipse at 50% 40%, rgba(200,133,10,0.35) 0%, rgba(200,133,10,0.12) 40%, transparent 75%)",
          animation: "softFlash 0.6s ease-out forwards",
        }} onAnimationEnd={onDone} />
        <motion.div key="scan" style={{
          position: "absolute", inset: 0, zIndex: 52, pointerEvents: "none", borderRadius: "inherit", overflow: "hidden",
        }}>
          <div style={{
            width: "100%", height: "3px",
            background: "linear-gradient(90deg, transparent, rgba(200,133,10,0.5), transparent)",
            animation: "softScanline 0.5s ease-out forwards",
          }} />
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

// ─── Film strip side bar ──────────────────────────────────────────────────────
const FilmSideStrip = ({ side, height }) => {
  const holeCount = Math.floor((height - 24) / 22);
  return (
    <div style={{
      width: "36px",
      background: "linear-gradient(180deg, #120800 0%, #1a0d04 50%, #120800 100%)",
      borderLeft: side === "right" ? "1px solid rgba(80,40,5,0.5)" : "none",
      borderRight: side === "left" ? "1px solid rgba(80,40,5,0.5)" : "none",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-evenly",
      padding: "12px 0", flexShrink: 0,
      borderRadius: side === "left" ? "10px 0 0 10px" : "0 10px 10px 0",
    }}>
      {Array.from({ length: Math.max(holeCount, 8) }).map((_, i) => (
        <div key={i} style={{
          width: "14px", height: "14px", borderRadius: "3px", background: "#060300",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.9), 0 0 0 1px rgba(60,30,5,0.4)",
        }} />
      ))}
    </div>
  );
};

// ─── Icon SVGs ────────────────────────────────────────────────────────────────
const EmailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8850a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="2,4 12,13 22,4" />
  </svg>
);
const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8850a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8850a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

// ─── Input field with icon ────────────────────────────────────────────────────
const Field = ({ icon, label, type, value, onChange }) => {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div
      animate={{ scale: focused ? 1.008 : 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      style={{
        display: "flex", alignItems: "center", gap: "12px",
        background: focused ? "rgba(8,4,1,0.96)" : "rgba(5,2,0,0.92)",
        borderRadius: "50px",
        border: focused ? "1px solid rgba(180,110,15,0.55)" : "1px solid rgba(100,55,5,0.30)",
        padding: "0 20px",
        boxShadow: focused
          ? "0 0 0 3px rgba(180,110,15,0.08), inset 0 1px 3px rgba(0,0,0,0.6)"
          : "inset 0 1px 3px rgba(0,0,0,0.5)",
        transition: "border-color 0.25s, box-shadow 0.25s, background 0.25s",
        height: "52px",
      }}>
      <div style={{ flexShrink: 0, opacity: focused ? 1 : 0.7, transition: "opacity 0.25s" }}>{icon}</div>
      <input type={type} value={value} onChange={onChange} placeholder={label}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          flex: 1, background: "transparent", border: "none", outline: "none",
          fontSize: "14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
          color: "#d4922e", letterSpacing: type === "password" && value ? "0.2em" : "0.02em",
        }}
      />
    </motion.div>
  );
};

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
      width: 560, height: 500, marginLeft: -280, marginTop: -250,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(200,133,10,0.12) 0%, transparent 70%)",
      filter: "blur(60px)", pointerEvents: "none", zIndex: 3,
    }} />
  );
};

// ─── Password Strength Rules ──────────────────────────────────────────────────
const PasswordRules = ({ password }) => {
  const rules = [
    { label: "At least 8 characters", test: password.length >= 8 },
    { label: "One uppercase letter", test: /[A-Z]/.test(password) },
    { label: "One lowercase letter", test: /[a-z]/.test(password) },
    { label: "One number", test: /[0-9]/.test(password) },
    { label: "One special character (!@#$...)", test: /[^A-Za-z0-9]/.test(password) },
  ];
  const passed = rules.filter(r => r.test).length;
  const barColor = passed <= 1 ? "#8b3a3a" : passed <= 3 ? "#b87010" : "#4a8f3a";
  return (
    <div style={{ margin: "-4px 0 8px 2px" }}>
      <div style={{ display: "flex", gap: "3px", marginBottom: "8px", height: "3px", borderRadius: "2px", overflow: "hidden" }}>
        {rules.map((_, i) => (
          <div key={i} style={{
            flex: 1, borderRadius: "2px",
            background: i < passed ? barColor : "rgba(100,55,5,0.2)",
            transition: "background 0.3s",
          }} />
        ))}
      </div>
      {rules.map((r, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: "6px",
          fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
          marginBottom: "3px", transition: "color 0.25s",
          color: r.test ? "rgba(100,200,80,0.8)" : "rgba(180,110,15,0.45)",
        }}>
          <span style={{
            width: "5px", height: "5px", borderRadius: "50%",
            transition: "background 0.25s, box-shadow 0.25s",
            background: r.test ? "rgba(100,200,80,0.9)" : "rgba(180,110,15,0.35)",
            boxShadow: r.test ? "0 0 6px rgba(100,200,80,0.4)" : "none",
          }} />
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Forgot Password Modal ────────────────────────────────────────────────────
const ForgotPasswordModal = ({ open, onClose }) => {
  const [fpEmail, setFpEmail] = useState("");
  const [sent, setSent] = useState(false);
  if (!open) return null;
  const handleSend = () => {
    if (!fpEmail || !/\S+@\S+\.\S+/.test(fpEmail)) return;
    setSent(true);
  };
  const handleClose = () => { setSent(false); setFpEmail(""); onClose(); };

  const modalOverlay = {
    position: "fixed", inset: 0, zIndex: 200,
    background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const modalBox = {
    background: "linear-gradient(160deg, rgba(18,8,2,0.98), rgba(10,5,1,0.99))",
    border: "1px solid rgba(150,80,10,0.35)", borderRadius: "20px",
    padding: "32px 28px", width: "clamp(280px, 85vw, 400px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(200,133,10,0.08)",
  };
  const inputStyle = {
    width: "100%", padding: "14px 18px", borderRadius: "50px",
    background: "rgba(5,2,0,0.92)", border: "1px solid rgba(100,55,5,0.30)",
    color: "#d4922e", fontFamily: "'DM Sans', sans-serif", fontSize: "14px",
    outline: "none", boxSizing: "border-box", marginBottom: "16px",
  };
  const btnStyle = {
    width: "100%", padding: "14px", borderRadius: "50px", border: "none",
    background: "linear-gradient(to right, #a06008, #c8850a, #d49520, #c8850a, #a06008)",
    color: "#fff8e0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
    fontSize: "13px", letterSpacing: "0.1em", textTransform: "uppercase",
    cursor: "pointer", boxShadow: "0 6px 28px rgba(160,90,5,0.40)",
  };

  return (
    <div style={modalOverlay} onClick={handleClose}>
      <motion.div
        style={modalBox}
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {!sent ? (
          <>
            <h2 style={{
              fontFamily: "'Syncopate', sans-serif", fontWeight: 700,
              fontSize: "18px", color: "#f0e8d0", letterSpacing: "0.1em",
              marginBottom: "8px",
            }}>Reset Password</h2>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
              color: "rgba(180,110,15,0.7)", lineHeight: 1.5, marginBottom: "20px",
            }}>Enter your email address and we'll send you a secure link to reset your password.</p>
            <input
              type="email" placeholder="Email Address" value={fpEmail}
              onChange={e => setFpEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              style={inputStyle}
            />
            <button style={btnStyle} onClick={handleSend}>Send Reset Link</button>
            <button onClick={handleClose} style={{
              display: "block", width: "100%", textAlign: "center",
              marginTop: "12px", padding: "10px", background: "none", border: "none",
              color: "rgba(180,110,15,0.55)", fontFamily: "'DM Sans', sans-serif",
              fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em",
            }}>Cancel</button>
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: "12px" }}>
                <circle cx="24" cy="24" r="22" stroke="rgba(100,200,80,0.6)" strokeWidth="2" fill="rgba(100,200,80,0.08)" />
                <polyline points="14,24 22,32 34,18" stroke="rgba(100,200,80,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <h2 style={{
                fontFamily: "'Syncopate', sans-serif", fontWeight: 700,
                fontSize: "18px", color: "#f0e8d0", letterSpacing: "0.1em",
                marginBottom: "10px",
              }}>Check Your Email</h2>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
                color: "rgba(180,110,15,0.7)", lineHeight: 1.5, marginBottom: "6px",
              }}>We've sent a password reset link to<br /><span style={{ color: "#d4922e", fontWeight: 600 }}>{fpEmail}</span></p>
              <p style={{ fontSize: "11px", color: "rgba(180,110,15,0.5)", fontFamily: "'DM Sans', sans-serif" }}>Didn't receive it? Check your spam folder or try again.</p>
            </div>
            <button style={{ ...btnStyle, marginTop: "12px" }} onClick={handleClose}>Done</button>
          </>
        )}
      </motion.div>
    </div>
  );
};


// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EvzonesProtocol() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoad] = useState(false);
  const [flash, setFlash] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const cardRef = useRef(null);
  const [cardH, setCardH] = useState(480);

  useEffect(() => {
    const obs = new ResizeObserver(e => setCardH(e[0].contentRect.height));
    if (cardRef.current) obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, []);

  const isPasswordStrong = (p) => {
    return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
  };

  const valid = () => {
    if (mode === "login") return email && pwd;
    if (!name || !email || !pwd || !confirmPwd) return false;
    if (!isPasswordStrong(pwd)) return false;
    if (pwd !== confirmPwd) return false;
    return true;
  };

  const handleSignIn = () => {
    if (mode === "signup") {
      if (pwd && !isPasswordStrong(pwd)) {
        setPwdError("Password doesn't meet all requirements");
        setTimeout(() => setPwdError(""), 3000);
        return;
      }
      if (pwd !== confirmPwd) {
        setPwdError("Passwords don't match");
        setTimeout(() => setPwdError(""), 3000);
        return;
      }
    }
    if (!valid()) return;
    setPwdError("");
    setFlash(true);
    setLoad(true);
    setTimeout(() => setLoad(false), 2000);
  };

  const switchMode = m => { setMode(m); setEmail(""); setPwd(""); setName(""); setConfirmPwd(""); setPwdError(""); };

  const flipDeg = useMotionValue(0);
  useEffect(() => { flipDeg.set(mode === "signup" ? 180 : 0); }, [mode]);
  const flipSpring = useSpring(flipDeg, { stiffness: 80, damping: 18 });

  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), { stiffness: 160, damping: 26 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), { stiffness: 160, damping: 26 });
  const combinedRotateY = useTransform([flipSpring, ry], ([f, t]) => f + t);
  const frontOpacity = useTransform(flipSpring, [0, 80, 100, 180], [1, 1, 0, 0]);
  const backOpacity = useTransform(flipSpring, [0, 80, 100, 180], [0, 0, 1, 1]);

  const onCardMouse = e => {
    const r = cardRef.current?.getBoundingClientRect(); if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onCardLeave = () => { mx.set(0); my.set(0); };

  const AMBER = "#c8850a";
  const AMBER_DIM = "rgba(180,110,15,0.55)";

  return (
    <>
      <FontInjector />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        body {
          background: radial-gradient(ellipse at 50% 48%, #3a1800 0%, #180900 30%, #080400 65%, #030200 100%);
          overflow: hidden;
          font-family: 'DM Sans', sans-serif;
        }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 40px #0d0600 inset !important;
          -webkit-text-fill-color: #c8850a !important;
        }
        input::placeholder { color: rgba(180, 110, 20, 0.6); }
        input:focus { outline: none; }
        @keyframes softFlash {
          0%   { opacity: 0; }
          15%  { opacity: 0.35; }
          40%  { opacity: 0.18; }
          100% { opacity: 0; }
        }
        @keyframes softScanline {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
      `}</style>

      <CursorBlob />

      <div style={{
        position: "relative", zIndex: 10,
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "20px 0", gap: "0",
      }}>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ textAlign: "center", marginBottom: "22px" }}>
          <h1 style={{
            fontFamily: "'Syncopate', sans-serif", fontWeight: 700,
            fontSize: "clamp(22px,3.6vw,34px)",
            color: "#f0e8d0", letterSpacing: "0.22em",
            textShadow: "0 0 40px rgba(200,133,10,0.25), 0 2px 12px rgba(200,133,10,0.12)",
            marginBottom: "10px", textTransform: "uppercase",
          }}>Evzones Protocol</h1>
          <p style={{
            fontFamily: "'Courier Prime', monospace", fontSize: "11px",
            color: AMBER_DIM, letterSpacing: "0.32em",
          }}>ACCESS PORTAL</p>
        </motion.div>

        {/* Card + Film strips */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.85, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: "flex", alignItems: "stretch", position: "relative" }}>

          <FilmSideStrip side="left" height={cardH} />

          <div
            ref={cardRef}
            onMouseMove={onCardMouse}
            onMouseLeave={onCardLeave}
            style={{
              width: "clamp(300px, 88vw, 440px)",
              background: "linear-gradient(160deg, rgba(18,8,2,0.97) 0%, rgba(10,5,1,0.99) 100%)",
              border: "1px solid rgba(150,80,10,0.30)",
              borderLeft: "none", borderRight: "none",
              padding: "28px 28px 24px",
              position: "relative", overflow: "hidden",
            }}>

            <CameraFlash active={flash} onDone={() => setFlash(false)} />

            {/* Corner brackets */}
            {[
              { top: "10px", left: "10px" },
              { top: "10px", right: "10px" },
            ].map((pos, i) => (
              <div key={i} style={{
                position: "absolute", ...pos,
                width: "14px", height: "14px",
                borderTop: `1.5px solid ${AMBER_DIM}`,
                ...(i === 0
                  ? { borderLeft: `1.5px solid ${AMBER_DIM}` }
                  : { borderRight: `1.5px solid ${AMBER_DIM}` }),
              }} />
            ))}

            {/* Mode tabs */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "22px", position: "relative", zIndex: 2 }}>
              {["login", "signup"].map(m => (
                <motion.button
                  key={m}
                  onClick={() => switchMode(m)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    flex: 1, padding: "11px 12px", borderRadius: "50px",
                    border: mode === m ? "1px solid rgba(200,133,10,0.5)" : "1px solid rgba(120,65,5,0.35)",
                    background: mode === m ? "linear-gradient(145deg, #b87010, #8f5a06)" : "rgba(10,5,1,0.6)",
                    color: mode === m ? "#fff8e8" : AMBER_DIM,
                    fontSize: "11px", fontWeight: 700, letterSpacing: "0.10em",
                    fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase",
                    cursor: "pointer",
                    boxShadow: mode === m ? "0 4px 18px rgba(160,90,5,0.35), inset 0 1px 0 rgba(255,220,120,0.2)" : "none",
                    transition: "all 0.25s ease",
                  }}>
                  {m === "login" ? "Sign In" : "Create Account"}
                </motion.button>
              ))}
            </div>

            {/* 3D Flip Container */}
            <div style={{ perspective: "900px" }}>
              <motion.div style={{
                rotateX: rx, rotateY: combinedRotateY,
                transformStyle: "preserve-3d", position: "relative", height: "388px",
              }}>

                {/* Front — Login */}
                <motion.div style={{
                  position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: "12px",
                  backfaceVisibility: "hidden", opacity: frontOpacity,
                  pointerEvents: mode === "login" ? "auto" : "none",
                }}>
                  <Field icon={<UserIcon />} label="Full Name" type="text" value={name} onChange={e => setName(e.target.value)} />
                  <Field icon={<EmailIcon />} label="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                  <Field icon={<LockIcon />} label="Password" type="password" value={pwd} onChange={e => setPwd(e.target.value)} />

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <motion.button
                      onClick={() => setShowForgot(true)}
                      whileHover={{ scale: 1.05, color: "rgba(200,133,10,0.85)" }}
                      whileTap={{ scale: 0.97 }}
                      style={{
                        padding: "7px 16px", borderRadius: "50px", background: "transparent",
                        border: "1px solid rgba(140,80,5,0.40)",
                        fontSize: "10px", letterSpacing: "0.14em",
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                        color: AMBER_DIM, cursor: "pointer",
                        textTransform: "uppercase", transition: "all 0.2s",
                      }}>
                      Forgot Password?
                    </motion.button>
                  </div>

                  <div style={{ height: "4px" }} />

                  <motion.button
                    onClick={handleSignIn}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97, y: 1 }}
                    disabled={loading}
                    style={{
                      width: "100%", padding: "15px 24px", borderRadius: "50px",
                      background: "linear-gradient(to right, #a06008, #c8850a, #d49520, #c8850a, #a06008)",
                      border: "1px solid rgba(200,140,30,0.45)",
                      fontSize: "13px", fontFamily: "'DM Sans', sans-serif", fontWeight: 800,
                      letterSpacing: "0.14em", textTransform: "uppercase",
                      color: "#fff8e0", cursor: "pointer", position: "relative", overflow: "hidden",
                      boxShadow: "0 6px 28px rgba(160,90,5,0.40), inset 0 1px 0 rgba(255,230,120,0.25)",
                      textShadow: "0 1px 4px rgba(60,30,0,0.6)",
                    }}>
                    <motion.div
                      style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,245,180,0.35),transparent)" }}
                      animate={{ x: ["-120%", "220%"] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.8 }}
                    />
                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.div key="ld" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                          {[0, 1, 2].map(i => (
                            <motion.div key={i}
                              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.15 }}
                              style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff8e0" }} />
                          ))}
                        </motion.div>
                      ) : (
                        <motion.span key="lbl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Sign In</motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", paddingTop: "6px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: "4px", height: "4px", borderRadius: "50%", background: AMBER_DIM }} />
                      ))}
                    </div>
                    <p style={{
                      fontFamily: "'Courier Prime',monospace", fontSize: "9.5px",
                      color: "rgba(150,85,5,0.45)", letterSpacing: "0.14em", textTransform: "uppercase",
                      textAlign: "center",
                    }}>Protected by Evzones Security<br />Protocol v2.4</p>
                  </div>
                </motion.div>

                {/* Back — Signup */}
                <motion.div style={{
                  position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: "12px",
                  backfaceVisibility: "hidden", rotateY: 180, opacity: backOpacity,
                  pointerEvents: mode === "signup" ? "auto" : "none",
                }}>
                  <Field icon={<UserIcon />} label="Full Name" type="text" value={name} onChange={e => setName(e.target.value)} />
                  <Field icon={<EmailIcon />} label="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                  <Field icon={<LockIcon />} label="Password" type="password" value={pwd} onChange={e => setPwd(e.target.value)} />

                  {pwd.length > 0 && <PasswordRules password={pwd} />}

                  <Field icon={<LockIcon />} label="Confirm Password" type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />

                  {pwdError && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      style={{ fontSize: "11px", color: "#c45050", fontFamily: "'DM Sans', sans-serif", padding: "0 4px", marginTop: "-4px" }}>
                      {pwdError}
                    </motion.div>
                  )}
                  {pwd && confirmPwd && pwd !== confirmPwd && !pwdError && (
                    <div style={{ fontSize: "11px", color: "rgba(196,80,80,0.8)", fontFamily: "'DM Sans', sans-serif", padding: "0 4px", marginTop: "-4px" }}>
                      Passwords don't match
                    </div>
                  )}

                  <div style={{ height: "4px" }} />

                  <motion.button
                    onClick={handleSignIn}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97, y: 1 }}
                    disabled={loading}
                    style={{
                      width: "100%", padding: "15px 24px", borderRadius: "50px",
                      background: "linear-gradient(to right, #a06008, #c8850a, #d49520, #c8850a, #a06008)",
                      border: "1px solid rgba(200,140,30,0.45)",
                      fontSize: "13px", fontFamily: "'DM Sans', sans-serif", fontWeight: 800,
                      letterSpacing: "0.14em", textTransform: "uppercase",
                      color: "#fff8e0", cursor: "pointer", position: "relative", overflow: "hidden",
                      boxShadow: "0 6px 28px rgba(160,90,5,0.40), inset 0 1px 0 rgba(255,230,120,0.25)",
                      textShadow: "0 1px 4px rgba(60,30,0,0.6)",
                    }}>
                    <motion.div
                      style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,245,180,0.35),transparent)" }}
                      animate={{ x: ["-120%", "220%"] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.8 }}
                    />
                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.div key="ld" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                          {[0, 1, 2].map(i => (
                            <motion.div key={i}
                              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.15 }}
                              style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff8e0" }} />
                          ))}
                        </motion.div>
                      ) : (
                        <motion.span key="lbl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Create Account</motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", paddingTop: "6px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: "4px", height: "4px", borderRadius: "50%", background: AMBER_DIM }} />
                      ))}
                    </div>
                    <p style={{
                      fontFamily: "'Courier Prime',monospace", fontSize: "9.5px",
                      color: "rgba(150,85,5,0.45)", letterSpacing: "0.14em", textTransform: "uppercase",
                      textAlign: "center",
                    }}>Protected by Evzones Security<br />Protocol v2.4</p>
                  </div>
                </motion.div>

              </motion.div>
            </div>
          </div>

          <FilmSideStrip side="right" height={cardH} />
        </motion.div>

        <ForgotPasswordModal open={showForgot} onClose={() => setShowForgot(false)} />
      </div>
    </>
  );
}

