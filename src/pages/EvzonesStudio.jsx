// src/pages/EvzonesStudio.jsx
// ✅ UI from Good_UI, logic from Good_Logic (single‑file HTML output)
import React, { useState, useCallback } from 'react';
import { processEvzonesVideo, generateSmartAsset } from '../utils/evzonesEngine';
import { useAuth } from '../context/AuthContext';

const VAULT_URL = (() => {
  if (import.meta.env.VITE_VAULT_URL) return import.meta.env.VITE_VAULT_URL;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:3001' : window.location.origin;
})();

function Panel({ children, style = {} }) {
  return (
    <div style={{
      position: 'relative',
      borderRadius: '16px',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      transition: 'var(--transition)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function ProgressBar({ pct, label }) {
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{
        height: '4px',
        background: 'var(--bg-surface)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginBottom: '8px',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--accent)',
          borderRadius: '2px',
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'var(--text-muted)' }}>
        {label}
      </span>
    </div>
  );
}

function AmberBtn({ onClick, disabled, children, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '14px 24px',
        borderRadius: '32px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? 'var(--bg-surface)' : 'var(--accent)',
        border: '1px solid var(--border)',
        color: disabled ? 'var(--text-muted)' : 'white',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 700,
        fontSize: '14px',
        letterSpacing: '0.02em',
        transition: 'var(--transition)',
        ...style,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--accent-hover)'; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--accent)'; }}
    >
      {children}
    </button>
  );
}

export default function EvzonesStudio() {
  const { user } = useAuth();
  const email = user?.email || '';

  const [file, setFile] = useState(null);
  const [whitelist, setWhitelist] = useState('');
  const [phase, setPhase] = useState('idle');   // idle | processing | ready | error
  const [progress, setProgress] = useState({ pct: 0, label: '' });
  const [result, setResult] = useState(null);    // { htmlBlob, assetID, fileName }
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onProgress = useCallback((p) => setProgress({ pct: p.pct ?? 0, label: p.label ?? '' }), []);

  const handleProcess = async () => {
    if (!file) return alert('Select a video file first');
    if (!email) return alert('Please log in');

    setPhase('processing');
    setError('');
    setResult(null);
    setBusy(true);

    try {
      setProgress({ pct: 0, label: 'Initializing…' });
      const data = await processEvzonesVideo(file, onProgress);
      setProgress({ pct: 93, label: 'Uploading to vault…' });

      const saveRes = await fetch(`${VAULT_URL}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brain: data.brain,
          segmentCount: data.segmentCount,
          whitelist: whitelist.split(',').map(s => s.trim()).filter(Boolean),
          email,
          fileName: file.name,
        }),
      });

      if (!saveRes.ok) {
        const errBody = await saveRes.json().catch(() => ({}));
        throw new Error(`Save failed: ${saveRes.status} — ${errBody.error || saveRes.statusText}`);
      }

      const { assetID, ingestToken } = await saveRes.json();
      if (!assetID || !ingestToken) throw new Error('Vault returned incomplete response');

      setProgress({ pct: 96, label: 'Building smart asset…' });
      const htmlBlob = await generateSmartAsset(data, assetID, VAULT_URL, ingestToken);

      setResult({ htmlBlob, assetID, fileName: file.name });
      setPhase('ready');
      setProgress({ pct: 100, label: 'Complete' });

      setHistory(prev => [{
        name: file.name,
        size: `${(file.size / 1048576).toFixed(1)} MB`,
        assetID,
        time: new Date().toLocaleTimeString(),
      }, ...prev]);

    } catch (err) {
      console.error(err);
      setError(err.message);
      setPhase('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px 60px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 'clamp(24px, 5vw, 32px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          margin: 0,
        }}>
          Protect Media
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '14px', maxWidth: '560px' }}>
          Transform your video into a self‑defending asset. All processing is client‑side.
        </p>
      </div>

      {/* 3‑column grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '20px',
        marginBottom: '24px',
      }}>
        {/* Step 1 — Upload */}
        <Panel style={{ padding: '24px' }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--accent)',
            marginBottom: '12px',
          }}>01 / Upload Media</h3>
          <div
            onClick={() => !busy && document.getElementById('fi-studio').click()}
            style={{
              border: `1px dashed var(--border)`,
              borderRadius: '12px',
              padding: '28px 16px',
              textAlign: 'center',
              cursor: busy ? 'default' : 'pointer',
              transition: 'var(--transition)',
            }}
            onMouseEnter={(e) => !busy && (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>{file ? '📁' : '📂'}</div>
            {file ? (
              <>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                  {file.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {(file.size / 1048576).toFixed(1)} MB
                </div>
              </>
            ) : (
              <>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Click to select video</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MP4 · MOV · MKV — up to 10GB+</div>
              </>
            )}
          </div>
          <input
            id="fi-studio"
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setPhase('idle');
              setResult(null);
              setError('');
            }}
          />
        </Panel>

        {/* Step 2 — Configure */}
        <Panel style={{ padding: '24px' }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--accent)',
            marginBottom: '12px',
          }}>02 / Configure</h3>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '6px',
            }}>Allowed Domains</label>
            <input
              type="text"
              placeholder="example.com, news.site"
              value={whitelist}
              disabled={busy}
              onChange={(e) => setWhitelist(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '32px',
                padding: '10px 16px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                transition: 'var(--transition)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Comma‑separated. Unauthorized access triggers an alert.
            </p>
          </div>
          <div>
            <label style={{
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '6px',
            }}>Owner</label>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '32px',
              padding: '10px 16px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {email}
            </div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            marginTop: '20px',
          }}>
            {[['AES-256', 'Cipher'], ['RSA-2048', 'Handshake'], ['OPFS', 'Storage'], ['SW 206', 'Safari']].map(([v, l]) => (
              <div key={v} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 4px',
                textAlign: 'center',
              }}>
                <div style={{ fontWeight: 600, fontSize: '11px', color: 'var(--accent)' }}>{v}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{l}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Step 3 — Status */}
        <Panel style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--accent)',
            marginBottom: '4px',
          }}>03 / Status</h3>
          {history.length === 0 && phase === 'idle' && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No assets protected this session.</p>
          )}
          {history.map((h, i) => (
            <div key={i} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '10px 12px',
            }}>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{h.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{h.size} · {h.time}</div>
              <code style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{h.assetID.slice(0, 16)}…</code>
            </div>
          ))}
          {busy && <ProgressBar pct={progress.pct} label={progress.label} />}
          {phase === 'error' && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#ef4444',
            }}>
              ⚠ {error}
            </div>
          )}
        </Panel>
      </div>

      {/* Execute Panel */}
      <Panel style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>🔑</span>
            <div><div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--accent)' }}>BRAIN</div><div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Init segment → vault</div></div>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '20px' }}>→</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>📦</span>
            <div><div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--accent)' }}>BRICK</div><div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Encrypted body</div></div>
          </div>
        </div>
        <AmberBtn onClick={handleProcess} disabled={busy || !file || phase === 'ready'}>
          {phase === 'processing' ? `⏳ ${progress.label || 'Processing…'}` :
           phase === 'ready' ? '✓ Asset Ready — Download Below' :
           '⚡ Generate Protected Asset'}
        </AmberBtn>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
          FFmpeg runs in‑browser · No video data leaves your device
        </p>
      </Panel>

      {/* Result Panel */}
      {phase === 'ready' && result && (
        <Panel style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Asset Secured</div><code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{result.assetID}</code></div>
          </div>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '20px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}>
            Your protected video is ready as a <strong>single HTML file</strong>.
            Download it and host anywhere – no extra files needed.
          </div>
          <AmberBtn
            onClick={async () => {
              const url = URL.createObjectURL(result.htmlBlob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `EVZONES_${result.fileName.replace(/\.[^/.]+$/, '')}.html`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            }}
          >
            📄 Download Protected HTML
          </AmberBtn>
        </Panel>
      )}
    </div>
  );
}