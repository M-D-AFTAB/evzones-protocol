import React, { useState } from 'react';
// Add generateSmartAsset to the curly braces
import { processEvzonesVideo, generateSmartAsset } from '../utils/evzonesEngine';


// Icons for UX (simulated for simplicity, use SVG/FontAwesome for production)
const IcUpload = () => <span style={{ fontSize: '3rem' }}>📄</span>;
const IcShield = () => <span style={{ fontSize: '1rem' }}>🛡️</span>;
const IcBrain = () => <span style={{ fontSize: '2.5rem' }}>🔑</span>;
const IcBrick = () => <span style={{ fontSize: '2.5rem' }}>📦</span>;
const IcGlobe = () => <span>🌐</span>;

export default function EvzonesStudio() {
    const [file, setFile] = useState(null);
    const [whitelist, setWhitelist] = useState('');
    const [email, setEmail] = useState('');
    const [trackingActive, setTrackingActive] = useState(true);
    const [status, setStatus] = useState('Standby');
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);

    const handleShieldAsset = async () => {
        if (!file || !whitelist || !email) return alert("All fields are required.");

        try {
            setStatus('PROCESSING');

            // 1. Process video locally
            const data = await processEvzonesVideo(file);

            // 2. Save to your Vercel Vault (This is where assetID comes from)
            const res = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brain: Array.from(data.brain), // Convert for JSON
                    key: data.key,
                    kid: data.kid,
                    whitelist: whitelist.split(','),
                    email: email,
                    fileName: file.name
                })
            });

            if (!res.ok) throw new Error("Failed to save to Vault");

            // FIX: Ensure assetID is extracted correctly from the response
            const responseData = await res.json();
            const assetID = responseData.assetID;

            // 3. Generate HTML using the NEWLY RECEIVED assetID
            const smartHtml = await generateSmartAsset({ ...data, assetID });

            setResult({ smartHtml });
            setStatus('SUCCESS');

            // Update history with the correct entry
            const newEntry = {
                name: file.name,
                size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
                time: new Date().toLocaleTimeString('en-GB')
            };
            setHistory(prev => [newEntry, ...prev]);

        } catch (err) {
            console.error("Evzones Error:", err);
            setStatus('FAILURE');
        }
    };

    return (
        <div className="sentinel-wrapper">

            {/* 1. Header & Navigation (Matches top-bar) */}
            <header className="sentinel-header">
                <div className="logo-group">
                    <IcShield />
                    <div className="logo-text">
                        <span>EVZONES PROTOCOL</span>
                        <span className="logo-status">ACTIVE DEFENSE</span>
                    </div>
                </div>
                <nav className="nav-links">
                    {['HOME', 'PROTECT ASSET', 'DASHBOARD', 'DOCUMENTATION', 'ABOUT'].map(link => (
                        <a key={link} href="#" className={link === 'PROTECT ASSET' ? 'active' : ''}>{link}</a>
                    ))}
                </nav>
            </header>

            {/* 2. Main workflow title (Matches center-align) */}
            <h1 className="main-workflow-title">PROTECT YOUR MEDIA</h1>

            {/* 3. The 3-Column Workflow Panel (Matches main card structure) */}
            <main className="evzones-core-workflow">

                {/* Step 1: Upload (Matches drag-drop zone) */}
                <section className="workflow-card upload-zone">
                    <h3>1. UPLOAD YOUR MEDIA</h3>
                    <div className="drop-zone">
                        <IcUpload />
                        <p>drag-and-drop video file<br />or</p>
                        <input
                            type="file"
                            accept="video/mp4, video/x-m4v, video/*"
                            style={{ display: 'none' }}
                            id="fileInput"
                            onChange={(e) => setFile(e.target.files[0])}
                        />
                        <label htmlFor="fileInput" className="choose-file-btn">
                            {file ? file.name : 'CHOOSE FILE'}
                        </label>
                        <p className="formats-hint">SELECT FILE (MP4, MOV...)</p>
                    </div>
                </section>

                {/* Step 2: Configure (Matches right-side inputs) */}
                <section className="workflow-card configure-section">
                    <h3>2. CONFIGURE PROTECTION</h3>

                    <div className="input-block">
                        <label><IcGlobe /> ALLOWED DOMAINS (comma separated):</label>
                        <input
                            type="text"
                            placeholder="example.com, sports-news.co"
                            value={whitelist}
                            onChange={(e) => setWhitelist(e.target.value)}
                        />
                    </div>

                    <div className="input-block">
                        <label>ALERT EMAIL:</label>
                        <input
                            type="email"
                            placeholder="security@protocol.io"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="toggle-block">
                        <div className="toggle-switch">
                            <input type="checkbox" checked={trackingActive} onChange={() => setTrackingActive(!trackingActive)} id="tracking" />
                            <label htmlFor="tracking"></label>
                        </div>
                        <span>ACTIVATE REAL-TIME TRACKING</span>
                    </div>
                </section>

                {/* Status Feed (Matches 'Live Protection Status' card) */}
                <aside className="workflow-card live-status-card">
                    <h3><span className="live-dot"></span>Live Protection Status</h3>
                    <div className="status-feed">
                        {history.length > 0 ? history.map((entry, i) => (
                            <div key={i} className="feed-entry">
                                Protected Asset "{entry.name}" ({entry.size}) secured at {entry.time}.<br />
                                Key stored in Sentinel Vault. <a href="#">Download Brick.</a>
                            </div>
                        )) : <p className="feed-empty">Standby. No assets processed in this session.</p>}
                    </div>
                </aside>
            </main>

            {/* 4. Binary Split Visualization & Execution (Matches center flow) */}
            <div className="split-execution-area">

                <div className="split-visuals">
                    <div className="split-asset brain-icon">
                        <IcBrain />
                        <div className="split-label">Key/Moov ID ("Brain")</div>
                    </div>
                    <div className="split-flow-arrow">---&gt;</div>
                    <div className="split-asset brick-icon">
                        <IcBrick />
                        <div className="split-label">Protected.mp4 "Brick" [&gt;100MB]</div>
                    </div>
                </div>

                {/* Step 3: Execute (Matches prominent generated asset button) */}
                <section className="execute-section">
                    <h3>3. SECURE & LOBOTOMIZE</h3>
                    <button
                        className={`generate-btn ${status === 'PROCESSING' ? 'loading' : ''}`}
                        onClick={handleShieldAsset}
                        disabled={status === 'PROCESSING'}
                    >
                        {status === 'PROCESSING' ? 'PROCESSING IN BROWSER...' : 'GENERATE PROTECTED ASSET'}
                        <span className="spinner"></span>
                    </button>
                    <p className="browser-processing-hint">
                        Video is processed entirely in your browser using FFmpeg.wasm. No data is sent to our server until you save.
                    </p>
                </section>
            </div>

            {/* 5. Result Download (Visible only after successful processing) */}
            {result && (
                <div className="result-download-panel">
                    Asset Secured! Your <strong>Self-Protecting Video</strong> is ready.
                    <button onClick={() => {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(result.smartHtml);
                        a.download = `EVZONES_${file.name}.html`;
                        a.click();
                    }}>DOWNLOAD SMART ASSET (.HTML)</button>
                </div>
            )}

            {/* Internal CSS for scoped styling (no external files needed) */}
            <style>{`
        .sentinel-wrapper {
          width: 100%;
          max-width: 1200px;
          display: flex;
          flex-direction: column;
          color: var(--text-main);
          background-image: url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2312243d' fill-opacity='0.2'%3E%3Cpath d='M40 40c0-11.046-8.954-20-20-20S0 28.954 0 40s8.954 20 20 20 20-8.954 20-20zm40 0c0-11.046-8.954-20-20-20S40 28.954 40 40s8.954 20 20 20 20-8.954 20-20zM20 20C20 8.954 11.046 0 0 0s-20 8.954-20 20 8.954 20 20 20 20-8.954 20-20zm40 0c0-11.046-8.954-20-20-20S20 8.954 20 20s8.954 20 20 20 20-8.954 20-20z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
          background-attachment: fixed;
          background-position: center;
          padding-bottom: 50px;
        }

        /* 1. Header & Nav */
        .sentinel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .logo-group {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text-main);
        }
        .logo-text { display: flex; flex-direction: column; font-weight: 700; }
        .logo-status { font-size: 0.7rem; color: var(--evzones-blue); font-weight: 300; }
        .nav-links { display: flex; gap: 30px; font-weight: 600; font-size: 0.9rem; }
        .nav-links a { color: var(--text-muted); text-decoration: none; transition: 0.3s; }
        .nav-links a:hover, .nav-links a.active { color: var(--text-main); }

        /* Titles */
        .main-workflow-title {
          text-align: center;
          margin: 60px 0 40px;
          font-size: 2.2rem;
          font-weight: 800;
          letter-spacing: 1px;
        }

        /* 2. Main Workflow Area */
        .evzones-core-workflow {
          display: grid;
          grid-template-columns: 1fr 1fr 0.8fr;
          gap: 20px;
          margin-bottom: 40px;
        }
        .workflow-card {
          background-color: var(--panel-dark);
          border-radius: 8px;
          padding: 25px;
          border: 1px solid rgba(255,255,255,0.03);
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .workflow-card h3 {
          margin: 0 0 20px;
          font-size: 1rem;
          color: var(--text-main);
          font-weight: 600;
        }

        /* Card 1: Upload */
        .drop-zone {
          border: 2px dashed rgba(255,255,255,0.08);
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 60px 20px;
          text-align: center;
          color: var(--text-muted);
          background-color: rgba(0,0,0,0.1);
        }
        .drop-zone p { margin: 15px 0; font-size: 0.85rem; }
        .choose-file-btn {
          background-color: #2c3e50;
          border: 1px solid #34495e;
          padding: 10px 20px;
          border-radius: 4px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .choose-file-btn:hover { background-color: #34495e; }
        .formats-hint { font-size: 0.75rem !important; margin-top: 5px; opacity: 0.6; }

        /* Card 2: Configure */
        .input-block { margin-bottom: 20px; }
        .input-block label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px; }
        .input-block input {
          width: 100%;
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 12px;
          border-radius: 4px;
          color: white;
          outline: none;
        }
        .toggle-block {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 20px;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .toggle-switch input { display: none; }
        .toggle-switch label {
          display: block;
          width: 40px;
          height: 20px;
          background-color: rgba(255,255,255,0.08);
          border-radius: 10px;
          position: relative;
          cursor: pointer;
        }
        .toggle-switch label:after {
          content: '';
          position: absolute;
          top: 2px; left: 2px;
          width: 16px; height: 16px;
          background: #4a5a6b;
          border-radius: 50%;
          transition: 0.3s;
        }
        .toggle-switch input:checked + label:after { background: var(--evzones-blue); left: 22px; }

        /* Card 3: Live Status */
        .live-dot {
          display: inline-block;
          width: 10px; height: 10px;
          background-color: var(--evzones-green);
          border-radius: 50%;
          margin-right: 8px;
          box-shadow: 0 0 10px var(--evzones-green);
        }
        .status-feed { font-size: 0.8rem; color: var(--text-muted); max-height: 250px; overflow-y: auto; }
        .feed-entry { margin-bottom: 15px; line-height: 1.6; }
        .feed-entry a { color: var(--evzones-blue); text-decoration: none; }
        .feed-entry a:hover { text-decoration: underline; }

        /* 3. Execution & Visualization Area */
        .split-execution-area {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 30px;
          padding: 0 20px;
        }

        .split-visuals {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 10px 20px;
          background-color: var(--panel-dark);
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.03);
        }
        .split-asset { display: flex; flex-direction: column; align-items: center; text-align: center; }
        .brain-icon { color: #f1c40f; }
        .brick-icon { color: #e74c3c; }
        .split-label { font-size: 0.7rem; color: var(--text-muted); margin-top: 5px; font-weight: 600; }
        .split-flow-arrow { font-family: monospace; color: var(--text-muted); font-size: 1.2rem; }

        .execute-section {
          background-color: var(--panel-dark);
          border-radius: 8px;
          padding: 25px;
          border: 1px solid rgba(255,255,255,0.03);
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          width: 400px;
        }
        .execute-section h3 {
          margin: 0 0 20px;
          font-size: 1rem;
          color: var(--text-main);
          font-weight: 600;
        }
        .generate-btn {
          width: 100%;
          background-color: var(--evzones-blue);
          border: none;
          color: white;
          padding: 15px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          position: relative;
          transition: 0.3s;
        }
        .generate-btn:hover { background-color: #0077d7; }
        .generate-btn:disabled { background-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.3); cursor: not-allowed; }
        .spinner {
          display: none;
          width: 20px; height: 20px;
          border: 3px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          position: absolute; right: 15px; top: calc(50% - 13px);
          animation: spin 1s linear infinite;
        }
        .generate-btn.loading .spinner { display: block; }
        .browser-processing-hint { font-size: 0.75rem; color: var(--text-muted); margin-top: 10px; line-height: 1.6; }

        .result-download-panel {
          grid-column: 1 / -1;
          margin-top: 30px;
          background-color: var(--evzones-green);
          color: #000;
          padding: 15px;
          border-radius: 4px;
          font-weight: 700;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .result-download-panel button {
          background-color: black;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}