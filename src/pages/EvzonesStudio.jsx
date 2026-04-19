import React, { useState } from 'react';
import { processEvzonesVideo, generateSmartAsset } from '../utils/evzonesEngine';

// Icons for UX
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

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const VAULT_URL = import.meta.env.VITE_VAULT_URL || (isLocal ? 'http://localhost:3001' : window.location.origin);

  const handleShieldAsset = async () => {
    if (!file) {
      alert('Please select a video file first');
      return;
    }

    if (!email) {
      alert('Please enter your email for security alerts');
      return;
    }

    try {
      setStatus('PROCESSING');

      // Step 1: Process video with FFmpeg (client-side)
      console.log('Processing video...');
      const data = await processEvzonesVideo(file);
      console.log('Video processed. Brain size:', data.brain.length, 'Brick size:', data.brick.length);

      // Step 2: Save to vault (send brain to server)
      console.log('Saving to vault...');
      const res = await fetch(`${VAULT_URL}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        
      body: JSON.stringify({
          brain: data.brain, // data.brain is already a Base64 string from evzonesEngine.js
          key: data.key,
          kid: data.kid,
          whitelist: whitelist.split(',').map(d => d.trim()).filter(d => d),
          email: email,
          fileName: file.name
      })
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const responseData = await res.json();
      console.log('Vault response:', responseData);

      const assetID = responseData.assetID;

      if (!assetID) {
        throw new Error('Server did not return an asset ID');
      }

      // Step 3: Generate Smart Asset HTML
      console.log('Generating smart asset with ID:', assetID);
      const smartHtml = await generateSmartAsset(data, assetID, VAULT_URL);

      setResult({ smartHtml, assetID });
      setStatus('SUCCESS');

      // Add to history
      setHistory([...history, {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        time: new Date().toLocaleTimeString(),
        assetID
      }]);

    } catch (err) {
      console.error("Evzones Error:", err);
      setStatus('FAILURE');
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="sentinel-wrapper">
      {/* 1. Header & Navigation */}
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

      {/* 2. Main workflow title */}
      <h1 className="main-workflow-title">PROTECT YOUR MEDIA</h1>

      {/* 3. The 3-Column Workflow Panel */}
      <main className="evzones-core-workflow">
        {/* Step 1: Upload */}
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

        {/* Step 2: Configure */}
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

        {/* Status Feed */}
        <aside className="workflow-card live-status-card">
          <h3><span className="live-dot"></span>Live Protection Status</h3>
          <div className="status-feed">
            {history.length > 0 ? history.map((entry, i) => (
              <div key={i} className="feed-entry">
                Protected Asset "{entry.name}" ({entry.size}) secured at {entry.time}.<br />
                Asset ID: <code>{entry.assetID}</code><br />
                Key stored in Sentinel Vault.
              </div>
            )) : <p className="feed-empty">Standby. No assets processed in this session.</p>}
          </div>
        </aside>
      </main>

      {/* 4. Binary Split Visualization & Execution */}
      <div className="split-execution-area">
        <div className="split-visuals">
          <div className="split-asset brain-icon">
            <IcBrain />
            <div className="split-label">Key/Moov ID ("Brain")</div>
          </div>
          <div className="split-flow-arrow">---&gt;</div>
          <div className="split-asset brick-icon">
            <IcBrick />
            <div className="split-label">Protected.mp4 "Brick"</div>
          </div>
        </div>

        {/* Step 3: Execute */}
        <section className="execute-section">
          <h3>3. SECURE & LOBOTOMIZE</h3>
          <button
            className={`generate-btn ${status === 'PROCESSING' ? 'loading' : ''}`}
            onClick={handleShieldAsset}
            disabled={status === 'PROCESSING' || !file}
          >
            {status === 'PROCESSING' ? 'PROCESSING IN BROWSER...' : 'GENERATE PROTECTED ASSET'}
            <span className="spinner"></span>
          </button>
          <p className="browser-processing-hint">
            Video is processed entirely in your browser using FFmpeg.wasm. No data is sent to our server until you save.
          </p>
          {status === 'FAILURE' && (
            <p style={{ color: '#e74c3c', marginTop: '10px' }}>
              ❌ Processing failed. Check console for details.
            </p>
          )}
        </section>
      </div>

      {/* 5. Result Download */}
      {result && (
        <div className="result-download-panel">
          <div>
            ✅ Asset Secured! Your <strong>Self-Protecting Video</strong> is ready.<br />
            <small>Asset ID: {result.assetID}</small>
          </div>
          <button onClick={() => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(result.smartHtml);
            a.download = `EVZONES_${file.name.replace('.mp4', '')}.html`;
            a.click();
          }}>DOWNLOAD SMART ASSET (.HTML)</button>
        </div>
      )}

      {/* Internal CSS for scoped styling */}
      <style>{`
        .sentinel-wrapper {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }

        /* 1. Header/Navigation Bar (Matches the 'top-bar' style) */
        .sentinel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: var(--panel-dark);
          border-radius: 8px;
          padding: 18px 25px;
          margin-bottom: 30px;
          border: 1px solid rgba(255,255,255,0.03);
        }
        .logo-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-text {
          display: flex;
          flex-direction: column;
          line-height: 1.3;
        }
        .logo-text span:first-child {
          font-size: 1.1rem;
          font-weight: 800;
          letter-spacing: 0.5px;
        }
        .logo-status {
          font-size: 0.65rem;
          color: var(--evzones-green);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .nav-links {
          display: flex;
          gap: 30px;
        }
        .nav-links a {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 600;
          position: relative;
          transition: 0.3s;
        }
        .nav-links a:hover, .nav-links a.active {
          color: var(--text-main);
        }
        .nav-links a.active::after {
          content: '';
          position: absolute;
          bottom: -5px; left: 0; right: 0;
          height: 2px;
          background-color: var(--evzones-blue);
        }

        .main-workflow-title {
          text-align: center;
          color: var(--text-main);
          margin-bottom: 30px;
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
        .feed-entry code { 
          background: rgba(0,255,0,0.1); 
          padding: 2px 6px; 
          border-radius: 3px; 
          font-family: monospace;
          font-size: 0.75rem;
        }

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
        .generate-btn:hover:not(:disabled) { background-color: #0077d7; }
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
          margin-top: 30px;
          background-color: var(--evzones-green);
          color: #000;
          padding: 20px;
          border-radius: 8px;
          font-weight: 700;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .result-download-panel button {
          background-color: black;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
        }
        .result-download-panel button:hover {
          background-color: #222;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}