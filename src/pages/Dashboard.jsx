// src/pages/Dashboard.jsx — Modern theme with global light/dark
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import worldMapUrl from '../assets/World_map.svg';

const VAULT_URL = (() => {
  if (import.meta.env.VITE_VAULT_URL) return import.meta.env.VITE_VAULT_URL;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:3001' : window.location.origin;
})();

const fmt = (sec) => {
  if (!sec && sec !== 0) return '--:--';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
};

const ago = (iso) => {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const isLive = (ts) => ts && Date.now() - new Date(ts) < 30000;

const hashHue = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
};
const viewerColor = (id) => `hsl(${hashHue(id)}, 65%, 55%)`;

// Geo IP cache
const geoCache = {};
async function geoIP(ip) {
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('192.168')) return null;
  if (geoCache[ip]) return geoCache[ip];
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`);
    const d = await r.json();
    if (d.latitude && d.longitude) {
      geoCache[ip] = { lat: d.latitude, lon: d.longitude, city: d.city, country: d.country_name };
      return geoCache[ip];
    }
  } catch {}
  return null;
}

function StatBox({ val, label, live = false }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        {live && val > 0 && (
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse 1.2s infinite',
            }}
          />
        )}
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 700,
            color: live && val > 0 ? 'var(--accent)' : 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {val}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '11px',
          color: 'var(--text-muted)',
          letterSpacing: '0.03em',
          marginTop: '6px',
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Simple Asset Card (without internal modal – we'll keep modal separate for brevity)
function AssetCard({ asset, onTrack, onKill }) {
  const live = (asset.sessions || []).filter((s) => isLive(s.last_seen)).length;

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        padding: '20px',
        transition: 'var(--transition)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '24px' }}>
          {asset.killed ? '💀' : live > 0 ? '📡' : '🔒'}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '20px',
            background: asset.killed
              ? 'rgba(239, 68, 68, 0.1)'
              : live > 0
              ? 'var(--accent-soft)'
              : 'var(--bg-surface)',
            color: asset.killed ? '#ef4444' : 'var(--accent)',
          }}
        >
          {asset.killed ? 'KILLED' : live > 0 ? 'LIVE' : 'ACTIVE'}
        </span>
      </div>
      <h4
        style={{
          fontWeight: 600,
          marginBottom: '4px',
          color: 'var(--text-primary)',
        }}
      >
        {asset.file_name}
      </h4>
      <code
        style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          display: 'block',
          marginBottom: '16px',
        }}
      >
        {asset.id.slice(0, 16)}…
      </code>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          padding: '12px 0',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          marginBottom: '16px',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{live}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>LIVE</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {(asset.sessions || []).length}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>SESSIONS</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {asset.segment_count || 0}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>SEGMENTS</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onTrack(asset)}
          style={{
            flex: 1,
            padding: '10px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '32px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'var(--transition)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
        >
          {live > 0 ? '📡 Live Track' : '📊 View Stats'}
        </button>
        {!asset.killed && (
          <button
            onClick={() => onKill(asset.id)}
            style={{
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '32px',
              color: '#ef4444',
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
          >
            💀
          </button>
        )}
      </div>
    </div>
  );
}

// World Map Component (cleaned up, theme‑aware)
function WorldMap({ sessions }) {
  const [geo, setGeo] = useState({});
  useEffect(() => {
    sessions.filter((s) => isLive(s.last_seen)).forEach(async (s) => {
      if (s.viewer_ip && !geo[s.viewer_ip]) {
        const g = await geoIP(s.viewer_ip);
        if (g) setGeo((prev) => ({ ...prev, [s.viewer_ip]: g }));
      }
    });
  }, [sessions]);

  const toXY = (lat, lon) => ({ x: ((lon + 180) / 360) * 1000, y: ((90 - lat) / 180) * 500 });

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        background: 'var(--bg-surface)',
      }}
    >
      <svg viewBox="0 0 1000 500" style={{ display: 'block', width: '100%', height: 'auto' }}>
        <image href={worldMapUrl} width="1000" height="500" preserveAspectRatio="xMidYMid slice" />
        {sessions
          .filter((s) => isLive(s.last_seen))
          .map((s) => {
            const g = geo[s.viewer_ip];
            if (!g) return null;
            const { x, y } = toXY(g.lat, g.lon);
            const col = viewerColor(s.id);
            return (
              <g key={s.id}>
                <circle cx={x} cy={y} r="8" fill="none" stroke={col} strokeWidth="1" opacity="0.5">
                  <animate attributeName="r" values="4;14;4" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={x} cy={y} r="4" fill={col} opacity="0.9">
                  <title>
                    {g.city}, {g.country} — {s.viewer_ip}
                  </title>
                </circle>
              </g>
            );
          })}
      </svg>
    </div>
  );
}

// Tracking Modal (simplified, theme‑aware)
function TrackingModal({ asset, onClose, onKill }) {
  const [data, setData] = useState(asset);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${VAULT_URL}/api/dashboard/asset?id=${asset.id}`);
      if (r.ok) setData(await r.json());
    } catch {}
  }, [asset.id]);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const active = (data.sessions || []).filter((s) => isLive(s.last_seen));
  const duration = data.duration || Math.max(300, ...(data.sessions || []).map((s) => (s.checkpoint || 0) * 1.1));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'var(--bg-elevated)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          animation: 'modalIn 0.25s ease',
          color: 'var(--text-primary)',
        }}
      >
        <style>{`@keyframes modalIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{active.length > 0 ? '📡' : '🔒'}</span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 700,
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {data.file_name}
              </div>
              <code style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: 'var(--text-muted)' }}>
                {data.id.slice(0, 20)}…
              </code>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>
              Viewer Locations · {active.length} active
            </h4>
            <WorldMap sessions={data.sessions || []} />
          </div>
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>
              Live Playheads · updates every 5s
            </h4>
            {active.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No active playheads</p>
            ) : (
              active.map((s) => {
                const col = viewerColor(s.id);
                const pct = Math.min(((s.checkpoint || 0) / duration) * 100, 100);
                return (
                  <div key={s.id} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span>{s.viewer_ip || 'viewer'}</span>
                      <span>{fmt(s.checkpoint)}</span>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        background: 'var(--bg-surface)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: col,
                          borderRadius: '3px',
                          transition: 'width 0.5s',
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Kill button */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '18px' }}>
            <button
              onClick={() => {
                if (confirm(`Kill "${data.file_name}"?`)) onKill(data.id);
              }}
              style={{
                width: '100%',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontFamily: 'Inter, sans-serif',
                fontSize: '12px',
                fontWeight: 600,
                padding: '12px',
                borderRadius: '32px',
                cursor: 'pointer',
              }}
            >
              💀 Kill Asset — Revoke All Playback Globally
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Dashboard
export default function Dashboard() {
  const { user } = useAuth();
  const [assets, setAssets] = useState([]);
  const [loading, setLoad] = useState(true);
  const [error, setError] = useState('');
  const [tracking, setTrack] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    if (!user?.email) return;
    try {
      const r = await fetch(`${VAULT_URL}/api/dashboard?email=${encodeURIComponent(user.email)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setAssets(d.assets || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoad(false);
    }
  }, [user?.email]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 8000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const handleKill = async (assetID) => {
    try {
      await fetch(`${VAULT_URL}/api/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetID, ownerEmail: user.email }),
      });
      await load();
      if (tracking?.id === assetID) setTrack(null);
    } catch (e) {
      alert('Kill failed: ' + e.message);
    }
  };

  const totalLive = assets.reduce((s, a) => s + (a.sessions || []).filter((x) => isLive(x.last_seen)).length, 0);
  const sorted = [...assets].sort((a, b) => {
    const al = (a.sessions || []).filter((s) => isLive(s.last_seen)).length;
    const bl = (b.sessions || []).filter((s) => isLive(s.last_seen)).length;
    return bl - al || new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <div style={{ padding: '32px 24px 60px', maxWidth: '1200px', margin: '0 auto' }}>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}
      </style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '32px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 'clamp(24px, 5vw, 32px)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Asset Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '14px' }}>
            Manage your protected media assets
          </p>
        </div>
        <a
          href="/app/studio"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: 'var(--accent)',
            color: 'white',
            borderRadius: '32px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'var(--transition)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
        >
          + New Asset
        </a>
      </div>

      {/* Stats Row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '32px',
          border: '1px solid var(--border)',
        }}
      >
        <StatBox val={totalLive} label="Live Viewers" live />
        <div style={{ width: '1px', background: 'var(--border)' }} />
        <StatBox val={assets.filter((a) => !a.killed).length} label="Active Assets" />
        <div style={{ width: '1px', background: 'var(--border)' }} />
        <StatBox val={assets.filter((a) => a.killed).length} label="Killed" />
        <div style={{ width: '1px', background: 'var(--border)' }} />
        <StatBox val={assets.reduce((s, a) => s + (a.sessions || []).length, 0)} label="Total Sessions" />
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            padding: '12px 16px',
            color: '#ef4444',
            fontSize: '13px',
            marginBottom: '24px',
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      )}

      {/* Empty State */}
      {!loading && assets.length === 0 && !error && (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 24px',
            background: 'var(--bg-secondary)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎬</div>
          <h3 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-primary)' }}>
            No protected assets yet
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Go to the Studio to protect your first video.
          </p>
          <a
            href="/app/studio"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'var(--accent)',
              color: 'white',
              borderRadius: '32px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Open Studio →
          </a>
        </div>
      )}

      {/* Asset Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {sorted.map((asset) => (
          <AssetCard key={asset.id} asset={asset} onTrack={setTrack} onKill={handleKill} />
        ))}
      </div>

      {/* Tracking Modal */}
      {tracking && (
        <TrackingModal asset={tracking} onClose={() => setTrack(null)} onKill={handleKill} />
      )}
    </div>
  );
}