// src/pages/Dashboard.jsx
// Shows all assets owned by the logged-in user.
// Clicking "Live Tracking" on any asset opens a modal with:
//   - Per-viewer playhead timeline
//   - 2D SVG world map with viewer location dots (IP-geolocated)
//   - Session log table
// Kill switch is accessible directly from the asset card.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const VAULT_URL = import.meta.env.VITE_VAULT_URL ||
    (window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin);

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(sec) {
    if (!sec && sec !== 0) return '--:--';
    return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function timeAgo(iso) {
    if (!iso) return '—';
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 5)   return 'just now';
    if (s < 60)  return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}

function isActive(lastSeen) {
    return lastSeen && (Date.now() - new Date(lastSeen)) < 30000;
}

function hashColor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    return `hsl(${Math.abs(h) % 360}, 70%, 62%)`;
}

// Convert lat/lng to SVG coordinates on a simple equirectangular projection
// SVG viewBox: 0 0 1000 500 covers -180 to +180 lon, +90 to -90 lat
function geoToSvg(lat, lon) {
    return {
        x: ((lon + 180) / 360) * 1000,
        y: ((90 - lat) / 180) * 500
    };
}

// ── IP Geolocation (cached per IP) ─────────────────────────────────────────
const geoCache = {};
async function geoIP(ip) {
    if (!ip || ip === 'unknown' || ip === '127.0.0.1') return null;
    if (geoCache[ip]) return geoCache[ip];
    try {
        const r = await fetch(`https://ipapi.co/${ip}/json/`);
        const d = await r.json();
        if (d.latitude && d.longitude) {
            geoCache[ip] = { lat: d.latitude, lon: d.longitude, city: d.city, country: d.country_name };
            return geoCache[ip];
        }
    } catch { /* ignore */ }
    return null;
}

// ── World Map (SVG equirectangular) ────────────────────────────────────────
// Uses a simplified world outline path. For a real deployment you'd use
// a proper topojson or SVG world map file.
function WorldMap({ sessions }) {
    const [geoData, setGeoData] = useState({});

    useEffect(() => {
        const activeSessions = sessions.filter(s => isActive(s.last_seen));
        activeSessions.forEach(async (s) => {
            if (s.viewer_ip && !geoData[s.viewer_ip]) {
                const g = await geoIP(s.viewer_ip);
                if (g) setGeoData(prev => ({ ...prev, [s.viewer_ip]: g }));
            }
        });
    }, [sessions]);

    return (
        <div className="db-map-wrap">
            <svg
                viewBox="0 0 1000 500"
                className="db-world-svg"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Subtle grid lines */}
                <defs>
                    <pattern id="grid" width="100" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 100 0 L 0 0 0 50" fill="none" stroke="rgba(0,200,255,0.05)" strokeWidth="0.5"/>
                    </pattern>
                </defs>
                <rect width="1000" height="500" fill="rgba(0,200,255,0.02)" rx="4" />
                <rect width="1000" height="500" fill="url(#grid)" />

                {/* Latitude lines */}
                {[-60,-30,0,30,60].map(lat => {
                    const y = ((90 - lat) / 180) * 500;
                    return <line key={lat} x1="0" y1={y} x2="1000" y2={y}
                        stroke="rgba(0,200,255,0.07)" strokeWidth="0.5" strokeDasharray="4,4" />;
                })}
                {/* Longitude lines */}
                {[-120,-60,0,60,120].map(lon => {
                    const x = ((lon + 180) / 360) * 1000;
                    return <line key={lon} x1={x} y1="0" x2={x} y2="500"
                        stroke="rgba(0,200,255,0.07)" strokeWidth="0.5" strokeDasharray="4,4" />;
                })}

                {/* World landmass — simplified continents as rough paths */}
                {/* North America */}
                <path d="M 80,60 L 90,50 L 120,50 L 150,70 L 160,100 L 180,110 L 200,130 L 220,150 L 210,170 L 190,180 L 170,200 L 160,220 L 140,240 L 120,250 L 100,240 L 90,220 L 80,190 L 70,170 L 75,130 L 70,100 Z"
                    fill="rgba(0,200,255,0.06)" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" />
                {/* South America */}
                <path d="M 170,240 L 195,230 L 210,250 L 220,280 L 215,320 L 200,360 L 185,400 L 175,420 L 165,400 L 155,360 L 150,320 L 155,280 L 160,260 Z"
                    fill="rgba(0,200,255,0.06)" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" />
                {/* Europe */}
                <path d="M 440,60 L 480,55 L 510,70 L 520,90 L 500,110 L 490,130 L 470,140 L 450,130 L 430,110 L 435,85 Z"
                    fill="rgba(0,200,255,0.06)" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" />
                {/* Africa */}
                <path d="M 450,140 L 490,135 L 520,155 L 535,190 L 540,240 L 530,290 L 510,330 L 490,360 L 475,370 L 460,355 L 445,310 L 435,270 L 430,220 L 435,175 Z"
                    fill="rgba(0,200,255,0.06)" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" />
                {/* Asia */}
                <path d="M 510,55 L 600,45 L 700,50 L 780,60 L 820,80 L 840,110 L 820,140 L 780,150 L 740,160 L 700,155 L 660,150 L 620,145 L 580,140 L 550,130 L 520,110 L 505,85 Z"
                    fill="rgba(0,200,255,0.06)" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" />
                {/* India */}
                <path d="M 620,145 L 650,150 L 660,180 L 650,220 L 640,250 L 625,260 L 610,245 L 600,210 L 605,175 Z"
                    fill="rgba(0,200,255,0.06)" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" />
                {/* Southeast Asia */}
                <path d="M 740,160 L 770,165 L 790,185 L 775,205 L 750,200 L 730,185 Z"
                    fill="rgba(0,200,255,0.06)" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" />
                {/* Australia */}
                <path d="M 760,290 L 820,275 L 870,285 L 890,310 L 880,350 L 850,380 L 810,390 L 770,375 L 748,345 L 750,310 Z"
                    fill="rgba(0,200,255,0.06)" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" />

                {/* Viewer dots */}
                {sessions.filter(s => isActive(s.last_seen)).map(session => {
                    const geo = geoData[session.viewer_ip];
                    if (!geo) return null;
                    const { x, y } = geoToSvg(geo.lat, geo.lon);
                    const color = hashColor(session.id);
                    return (
                        <g key={session.id}>
                            {/* Pulse ring */}
                            <circle cx={x} cy={y} r="8" fill="none" stroke={color} strokeWidth="1" opacity="0.5">
                                <animate attributeName="r" values="4;12;4" dur="2s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                            </circle>
                            {/* Dot */}
                            <circle cx={x} cy={y} r="4" fill={color} opacity="0.9">
                                <title>{geo.city}, {geo.country} — {session.viewer_ip}</title>
                            </circle>
                        </g>
                    );
                })}

                {/* Unlocated active viewers */}
                {sessions.filter(s => isActive(s.last_seen) && !geoData[s.viewer_ip]).length > 0 && (
                    <text x="10" y="490" fontSize="11" fill="rgba(0,200,255,0.4)" fontFamily="monospace">
                        {sessions.filter(s => isActive(s.last_seen) && !geoData[s.viewer_ip]).length} viewer(s) — locating…
                    </text>
                )}
            </svg>
        </div>
    );
}

// ── Playhead Timeline ───────────────────────────────────────────────────────
function PlayheadTimeline({ sessions }) {
    const active = sessions.filter(s => isActive(s.last_seen));
    const maxCP  = sessions.reduce((m, s) => Math.max(m, s.checkpoint || 0), 0);
    const total  = Math.max(maxCP * 1.1, 60);

    return (
        <div className="db-timeline">
            <div className="db-tl-bar">
                <div className="db-tl-track" />
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                    <div key={p} className="db-tl-marker" style={{ left: `${p * 100}%` }}>
                        <span>{formatDuration(total * p)}</span>
                    </div>
                ))}
                {active.map(s => {
                    const pct   = Math.min((s.checkpoint || 0) / total * 100, 99);
                    const color = hashColor(s.id);
                    return (
                        <div key={s.id} className="db-tl-head" style={{ left: `${pct}%`, '--c': color }}
                            title={`${s.viewer_ip} · ${formatDuration(s.checkpoint)}`}>
                            <div className="db-tl-dot" />
                            <div className="db-tl-label">{formatDuration(s.checkpoint)}</div>
                        </div>
                    );
                })}
            </div>
            {active.length === 0 && (
                <div className="db-tl-empty">No active viewers — playheads appear here in real-time</div>
            )}
        </div>
    );
}

// ── Live Tracking Modal ─────────────────────────────────────────────────────
function TrackingModal({ asset, onClose, onKill }) {
    const [data, setData]     = useState(asset);
    const [killing, setKill]  = useState(false);
    const pollRef             = useRef(null);

    const refresh = useCallback(async () => {
        try {
            const r = await fetch(`${VAULT_URL}/api/dashboard/asset?id=${asset.id}`);
            if (r.ok) setData(await r.json());
        } catch { /* non-fatal */ }
    }, [asset.id]);

    useEffect(() => {
        pollRef.current = setInterval(refresh, 5000);
        return () => clearInterval(pollRef.current);
    }, [refresh]);

    const activeSessions = (data.sessions || []).filter(s => isActive(s.last_seen));
    const allSessions    = data.sessions || [];

    const handleKill = async () => {
        if (!confirm(`Kill "${data.file_name}"?\n\nBlocks all viewers immediately. Cannot be undone.`)) return;
        setKill(true);
        await onKill(data.id);
        setKill(false);
        onClose();
    };

    return (
        <div className="db-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="db-modal">
                <div className="db-modal-header">
                    <div className="db-modal-title">
                        <span className="db-modal-icon">📡</span>
                        <div>
                            <div className="db-modal-filename">{data.file_name}</div>
                            <div className="db-modal-id">ID: {data.id.slice(0, 16)}…</div>
                        </div>
                    </div>
                    <div className="db-modal-meta">
                        <div className={`db-modal-live ${activeSessions.length > 0 ? 'on' : ''}`}>
                            <span className="db-modal-pulse" />
                            {activeSessions.length} LIVE
                        </div>
                        <div className="db-modal-total">{allSessions.length} total sessions</div>
                        <button className="db-modal-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="db-modal-body">
                    {/* World Map */}
                    <div className="db-modal-section">
                        <div className="db-modal-section-title">
                            VIEWER LOCATIONS
                            <span>{activeSessions.length} active dots</span>
                        </div>
                        <WorldMap sessions={allSessions} />
                    </div>

                    {/* Playhead Timeline */}
                    <div className="db-modal-section">
                        <div className="db-modal-section-title">
                            LIVE PLAYHEAD POSITIONS
                            <span>updates every 5s</span>
                        </div>
                        <PlayheadTimeline sessions={allSessions} />
                    </div>

                    {/* Session table */}
                    <div className="db-modal-section">
                        <div className="db-modal-section-title">
                            SESSION LOG
                            <span>{allSessions.length} sessions</span>
                        </div>
                        <div className="db-session-table">
                            <div className="db-st-head">
                                <span>STATUS</span><span>IP</span>
                                <span>PLAYHEAD</span><span>LAST SEEN</span><span>DOMAIN</span>
                            </div>
                            {allSessions.length === 0 && (
                                <div className="db-st-empty">No sessions yet</div>
                            )}
                            {allSessions
                                .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen))
                                .map(s => {
                                    const active = isActive(s.last_seen);
                                    return (
                                        <div key={s.id} className={`db-st-row ${active ? 'live' : ''}`}>
                                            <span>
                                                <span className={`db-dot ${active ? 'green' : 'dim'}`} />
                                                {active ? 'LIVE' : 'offline'}
                                            </span>
                                            <span className="db-mono">{s.viewer_ip || '—'}</span>
                                            <span className="db-mono">{formatDuration(s.checkpoint)}</span>
                                            <span>{timeAgo(s.last_seen)}</span>
                                            <span className="db-url">
                                                {s.viewer_url ? (() => { try { return new URL(s.viewer_url).hostname; } catch { return s.viewer_url; } })() : '—'}
                                            </span>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>

                    {/* Kill switch */}
                    {!data.killed && (
                        <div className="db-modal-kill-zone">
                            <button className="db-kill-btn" onClick={handleKill} disabled={killing}>
                                {killing ? '⏳ KILLING…' : '💀 KILL ASSET — REVOKE ALL PLAYBACK GLOBALLY'}
                            </button>
                            <p>Immediately blocks all viewers worldwide. Cannot be undone.</p>
                        </div>
                    )}
                    {data.killed && (
                        <div className="db-killed-banner">
                            💀 KILLED — All playback permanently revoked
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
    const { user }            = useAuth();
    const [assets, setAssets] = useState([]);
    const [loading, setLoad]  = useState(true);
    const [error, setError]   = useState('');
    const [tracking, setTracking] = useState(null); // asset being tracked
    const pollRef             = useRef(null);

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
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ assetID, ownerEmail: user.email })
            });
            await load();
        } catch (e) { alert('Kill failed: ' + e.message); }
    };

    const totalLive = assets.reduce((s, a) => s + (a.sessions || []).filter(x => isActive(x.last_seen)).length, 0);

    return (
        <div className="db-root">
            <div className="db-container">
                {/* Header */}
                <div className="db-header">
                    <div>
                        <h1 className="db-title">Asset Dashboard</h1>
                        <p className="db-sub">
                            {user?.email} · {assets.length} asset{assets.length !== 1 ? 's' : ''}
                            {totalLive > 0 && (
                                <span className="db-live-badge">
                                    <span className="db-live-pulse" />
                                    {totalLive} watching now
                                </span>
                            )}
                        </p>
                    </div>
                    <a href="/studio" className="db-new-btn">+ Protect New Video</a>
                </div>

                {/* Error */}
                {error && <div className="db-error">⚠ {error} — check your vault URL and API keys</div>}

                {/* Loading */}
                {loading && (
                    <div className="db-loading">
                        <div className="db-spinner" />
                        Loading assets…
                    </div>
                )}

                {/* Empty state */}
                {!loading && assets.length === 0 && !error && (
                    <div className="db-empty">
                        <div className="db-empty-icon">◈</div>
                        <h2>No protected assets yet</h2>
                        <p>Go to the Studio to protect your first video</p>
                        <a href="/studio" className="db-empty-cta">Open Studio →</a>
                    </div>
                )}

                {/* Asset grid */}
                <div className="db-asset-grid">
                    {assets
                        .sort((a, b) => {
                            const aL = (a.sessions||[]).filter(s=>isActive(s.last_seen)).length;
                            const bL = (b.sessions||[]).filter(s=>isActive(s.last_seen)).length;
                            return bL - aL || new Date(b.created_at) - new Date(a.created_at);
                        })
                        .map(asset => {
                            const live  = (asset.sessions || []).filter(s => isActive(s.last_seen)).length;
                            const total = (asset.sessions || []).length;
                            return (
                                <div key={asset.id} className={`db-asset-card ${asset.killed ? 'killed' : ''}`}>
                                    {/* Card top */}
                                    <div className="db-card-top">
                                        <div className="db-card-icon">
                                            {asset.killed ? '💀' : live > 0 ? '📡' : '🔒'}
                                        </div>
                                        <div className={`db-card-status ${asset.killed ? 'killed' : 'active'}`}>
                                            {asset.killed ? 'KILLED' : 'ACTIVE'}
                                        </div>
                                    </div>

                                    {/* File name */}
                                    <div className="db-card-name">{asset.file_name}</div>
                                    <div className="db-card-id">ID: {asset.id.slice(0, 12)}…</div>
                                    <div className="db-card-date">
                                        {new Date(asset.created_at).toLocaleDateString('en-GB', {
                                            day: '2-digit', month: 'short', year: 'numeric'
                                        })}
                                    </div>

                                    {/* Stats row */}
                                    <div className="db-card-stats">
                                        <div className="db-card-stat">
                                            <div className={`db-cs-val ${live > 0 ? 'live' : ''}`}>
                                                {live > 0 && <span className="db-cs-pulse" />}
                                                {live}
                                            </div>
                                            <div className="db-cs-label">LIVE NOW</div>
                                        </div>
                                        <div className="db-card-stat">
                                            <div className="db-cs-val">{total}</div>
                                            <div className="db-cs-label">SESSIONS</div>
                                        </div>
                                        <div className="db-card-stat">
                                            <div className="db-cs-val">{asset.segment_count || 0}</div>
                                            <div className="db-cs-label">SEGMENTS</div>
                                        </div>
                                        <div className="db-card-stat">
                                            <div className="db-cs-val">{(asset.whitelist || []).length}</div>
                                            <div className="db-cs-label">DOMAINS</div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="db-card-actions">
                                        <button
                                            className="db-track-btn"
                                            onClick={() => setTracking(asset)}
                                        >
                                            {live > 0 ? '📡 Live Tracking' : '📊 View Stats'}
                                        </button>
                                        {!asset.killed && (
                                            <button
                                                className="db-kill-mini"
                                                onClick={() => {
                                                    if (confirm(`Kill "${asset.file_name}"?`)) handleKill(asset.id);
                                                }}
                                                title="Kill this asset"
                                            >
                                                💀
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>

            {/* Tracking Modal */}
            {tracking && (
                <TrackingModal
                    asset={tracking}
                    onClose={() => setTracking(null)}
                    onKill={handleKill}
                />
            )}

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');

                :root {
                    --bg:    #040810;
                    --panel: #080f1c;
                    --p2:    #0c1526;
                    --cyan:  #00c8ff;
                    --green: #00ff88;
                    --red:   #ff3355;
                    --muted: rgba(180,220,255,0.45);
                    --text:  rgba(220,240,255,0.9);
                    --mono:  'Space Mono', monospace;
                    --sans:  'Syne', sans-serif;
                    --border: rgba(0,200,255,0.1);
                }

                .db-root {
                    min-height: 100vh;
                    background: var(--bg);
                    color: var(--text);
                    font-family: var(--sans);
                    padding-top: 80px;
                }
                .db-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 40px 24px 80px;
                }

                .db-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 40px;
                    flex-wrap: wrap;
                    gap: 20px;
                }
                .db-title {
                    font-size: 2rem;
                    font-weight: 800;
                    color: #fff;
                    margin: 0 0 8px;
                }
                .db-sub {
                    font-family: var(--mono);
                    font-size: 0.75rem;
                    color: var(--muted);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .db-live-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(0,255,136,0.08);
                    border: 1px solid rgba(0,255,136,0.2);
                    color: var(--green);
                    padding: 3px 10px;
                    border-radius: 20px;
                    font-size: 0.7rem;
                    font-weight: 700;
                }
                .db-live-pulse {
                    width: 6px; height: 6px;
                    border-radius: 50%;
                    background: var(--green);
                    animation: pulse 1.2s ease-out infinite;
                    box-shadow: 0 0 0 0 rgba(0,255,136,0.5);
                }
                @keyframes pulse {
                    0%   { box-shadow: 0 0 0 0 rgba(0,255,136,0.5); }
                    70%  { box-shadow: 0 0 0 8px rgba(0,255,136,0); }
                    100% { box-shadow: 0 0 0 0 rgba(0,255,136,0); }
                }
                .db-new-btn {
                    background: var(--cyan);
                    color: #000;
                    font-family: var(--sans);
                    font-size: 0.85rem;
                    font-weight: 700;
                    padding: 12px 24px;
                    border-radius: 6px;
                    text-decoration: none;
                    transition: all .2s;
                    white-space: nowrap;
                }
                .db-new-btn:hover {
                    background: #fff;
                    box-shadow: 0 0 30px rgba(0,200,255,0.3);
                }

                .db-error {
                    background: rgba(255,51,85,0.07);
                    border: 1px solid rgba(255,51,85,0.2);
                    color: var(--red);
                    font-family: var(--mono);
                    font-size: 0.75rem;
                    padding: 12px 16px;
                    border-radius: 6px;
                    margin-bottom: 24px;
                }
                .db-loading {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-family: var(--mono);
                    font-size: 0.8rem;
                    color: var(--muted);
                    padding: 60px 0;
                    justify-content: center;
                }
                .db-spinner {
                    width: 20px; height: 20px;
                    border: 2px solid rgba(0,200,255,0.15);
                    border-top: 2px solid var(--cyan);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .db-empty {
                    text-align: center;
                    padding: 100px 24px;
                }
                .db-empty-icon {
                    font-size: 3rem;
                    color: rgba(0,200,255,0.25);
                    margin-bottom: 20px;
                }
                .db-empty h2 {
                    font-size: 1.4rem;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 10px;
                }
                .db-empty p {
                    font-size: 0.9rem;
                    color: var(--muted);
                    margin-bottom: 28px;
                }
                .db-empty-cta {
                    display: inline-block;
                    background: var(--cyan);
                    color: #000;
                    font-weight: 700;
                    font-family: var(--sans);
                    padding: 12px 28px;
                    border-radius: 6px;
                    text-decoration: none;
                    transition: all .2s;
                }
                .db-empty-cta:hover { background: #fff; }

                /* Asset grid */
                .db-asset-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                }
                .db-asset-card {
                    background: var(--panel);
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    padding: 24px;
                    transition: border-color .2s, transform .2s, box-shadow .2s;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .db-asset-card:hover {
                    border-color: rgba(0,200,255,0.2);
                    transform: translateY(-2px);
                    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
                }
                .db-asset-card.killed {
                    border-color: rgba(255,51,85,0.15);
                    opacity: .65;
                }
                .db-card-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .db-card-icon { font-size: 1.6rem; }
                .db-card-status {
                    font-family: var(--mono);
                    font-size: 0.6rem;
                    font-weight: 700;
                    letter-spacing: 2px;
                    padding: 4px 9px;
                    border-radius: 3px;
                }
                .db-card-status.active {
                    background: rgba(0,255,136,0.08);
                    color: var(--green);
                    border: 1px solid rgba(0,255,136,0.25);
                }
                .db-card-status.killed {
                    background: rgba(255,51,85,0.08);
                    color: var(--red);
                    border: 1px solid rgba(255,51,85,0.25);
                }
                .db-card-name {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-top: 4px;
                }
                .db-card-id, .db-card-date {
                    font-family: var(--mono);
                    font-size: 0.65rem;
                    color: var(--muted);
                }
                .db-card-stats {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 8px;
                    margin: 8px 0;
                    padding: 16px 0;
                    border-top: 1px solid rgba(0,200,255,0.06);
                    border-bottom: 1px solid rgba(0,200,255,0.06);
                }
                .db-card-stat { text-align: center; }
                .db-cs-val {
                    font-family: var(--mono);
                    font-size: 1.3rem;
                    font-weight: 700;
                    color: var(--cyan);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                }
                .db-cs-val.live { color: var(--green); }
                .db-cs-pulse {
                    display: inline-block;
                    width: 6px; height: 6px;
                    border-radius: 50%;
                    background: var(--green);
                    animation: pulse 1.2s ease-out infinite;
                }
                .db-cs-label {
                    font-family: var(--mono);
                    font-size: 0.55rem;
                    color: var(--muted);
                    letter-spacing: 1px;
                    margin-top: 3px;
                }
                .db-card-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 4px;
                }
                .db-track-btn {
                    flex: 1;
                    background: rgba(0,200,255,0.08);
                    border: 1px solid rgba(0,200,255,0.2);
                    color: var(--cyan);
                    font-family: var(--sans);
                    font-size: 0.82rem;
                    font-weight: 600;
                    padding: 10px;
                    border-radius: 5px;
                    cursor: pointer;
                    transition: all .2s;
                }
                .db-track-btn:hover {
                    background: rgba(0,200,255,0.14);
                    border-color: rgba(0,200,255,0.35);
                }
                .db-kill-mini {
                    background: rgba(255,51,85,0.06);
                    border: 1px solid rgba(255,51,85,0.2);
                    color: var(--red);
                    padding: 10px 14px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 1rem;
                    transition: all .2s;
                }
                .db-kill-mini:hover {
                    background: rgba(255,51,85,0.12);
                    border-color: rgba(255,51,85,0.4);
                }

                /* ── Modal ──────────────────────────────────────────────── */
                .db-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(4,8,16,0.85);
                    backdrop-filter: blur(8px);
                    z-index: 2000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    animation: fadeIn .2s ease;
                }
                @keyframes fadeIn { from{opacity:0} to{opacity:1} }
                .db-modal {
                    background: var(--panel);
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    width: 100%;
                    max-width: 900px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,200,255,0.05);
                    animation: slideUp .25s ease both;
                }
                @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
                .db-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px 24px;
                    border-bottom: 1px solid var(--border);
                    flex-shrink: 0;
                    background: var(--p2);
                }
                .db-modal-title {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }
                .db-modal-icon { font-size: 1.5rem; }
                .db-modal-filename {
                    font-size: 1rem;
                    font-weight: 700;
                    color: #fff;
                }
                .db-modal-id {
                    font-family: var(--mono);
                    font-size: 0.65rem;
                    color: var(--muted);
                    margin-top: 2px;
                }
                .db-modal-meta {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .db-modal-live {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    font-family: var(--mono);
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--muted);
                }
                .db-modal-live.on { color: var(--green); }
                .db-modal-pulse {
                    width: 8px; height: 8px;
                    border-radius: 50%;
                    background: currentColor;
                    animation: pulse 1.2s ease-out infinite;
                }
                .db-modal-total {
                    font-family: var(--mono);
                    font-size: 0.7rem;
                    color: var(--muted);
                }
                .db-modal-close {
                    background: none;
                    border: 1px solid var(--border);
                    color: var(--muted);
                    width: 32px; height: 32px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 0.9rem;
                    transition: all .2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .db-modal-close:hover {
                    color: #fff;
                    border-color: rgba(255,255,255,0.3);
                    background: rgba(255,255,255,0.05);
                }
                .db-modal-body {
                    overflow-y: auto;
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 28px;
                }
                .db-modal-section {}
                .db-modal-section-title {
                    display: flex;
                    justify-content: space-between;
                    font-family: var(--mono);
                    font-size: 0.65rem;
                    letter-spacing: 2.5px;
                    color: var(--muted);
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(0,200,255,0.06);
                }
                .db-modal-section-title span {
                    color: var(--cyan);
                    font-size: 0.7rem;
                }

                /* World map */
                .db-map-wrap {
                    border: 1px solid var(--border);
                    border-radius: 6px;
                    overflow: hidden;
                    background: rgba(0,200,255,0.01);
                }
                .db-world-svg {
                    display: block;
                    width: 100%;
                    height: auto;
                }

                /* Timeline */
                .db-timeline { padding: 4px 0 8px; }
                .db-tl-bar {
                    position: relative;
                    height: 44px;
                    background: var(--p2);
                    border: 1px solid rgba(0,200,255,0.08);
                    border-radius: 4px;
                    margin-bottom: 10px;
                }
                .db-tl-track {
                    position: absolute;
                    top: 50%; left: 0; right: 0;
                    height: 1px;
                    background: rgba(0,200,255,0.1);
                    transform: translateY(-50%);
                }
                .db-tl-marker {
                    position: absolute;
                    top: 0; bottom: 0;
                    display: flex;
                    align-items: flex-end;
                    padding-bottom: 4px;
                    transform: translateX(-50%);
                }
                .db-tl-marker span {
                    font-family: var(--mono);
                    font-size: 0.58rem;
                    color: var(--muted);
                }
                .db-tl-head {
                    position: absolute;
                    top: 0; bottom: 0;
                    transform: translateX(-50%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 2;
                }
                .db-tl-dot {
                    width: 12px; height: 12px;
                    border-radius: 50%;
                    background: var(--c, var(--cyan));
                    box-shadow: 0 0 8px var(--c, var(--cyan));
                    margin-top: 10px;
                    animation: bounce 2s ease-in-out infinite;
                }
                @keyframes bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }
                .db-tl-label {
                    font-family: var(--mono);
                    font-size: 0.55rem;
                    color: var(--c, var(--cyan));
                    background: var(--panel);
                    padding: 1px 3px;
                    border-radius: 2px;
                    margin-top: 1px;
                    white-space: nowrap;
                }
                .db-tl-empty {
                    font-family: var(--mono);
                    font-size: 0.7rem;
                    color: var(--muted);
                    opacity: .6;
                    text-align: center;
                    padding: 8px 0;
                }

                /* Session table */
                .db-session-table {
                    border: 1px solid rgba(0,200,255,0.07);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .db-st-head, .db-st-row {
                    display: grid;
                    grid-template-columns: 80px 130px 90px 100px 1fr;
                    padding: 9px 14px;
                    font-family: var(--mono);
                    font-size: 0.68rem;
                    align-items: center;
                }
                .db-st-head {
                    background: var(--p2);
                    color: var(--muted);
                    letter-spacing: 1.5px;
                    border-bottom: 1px solid rgba(0,200,255,0.07);
                }
                .db-st-row {
                    border-bottom: 1px solid rgba(0,200,255,0.04);
                    color: rgba(180,220,255,0.55);
                }
                .db-st-row:last-child { border-bottom: none; }
                .db-st-row.live { background: rgba(0,255,136,0.025); color: var(--text); }
                .db-st-empty {
                    padding: 20px;
                    text-align: center;
                    font-family: var(--mono);
                    font-size: 0.7rem;
                    color: var(--muted);
                    opacity: .6;
                }
                .db-dot {
                    display: inline-block;
                    width: 6px; height: 6px;
                    border-radius: 50%;
                    margin-right: 6px;
                    vertical-align: middle;
                }
                .db-dot.green {
                    background: var(--green);
                    box-shadow: 0 0 5px var(--green);
                    animation: pulse 1.2s ease-out infinite;
                }
                .db-dot.dim { background: rgba(180,220,255,0.2); }
                .db-mono { font-size: 0.65rem; }
                .db-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.63rem; }

                /* Kill zone */
                .db-modal-kill-zone {
                    border-top: 1px solid rgba(255,51,85,0.12);
                    padding-top: 20px;
                }
                .db-kill-btn {
                    background: rgba(255,51,85,0.07);
                    border: 1px solid rgba(255,51,85,0.3);
                    color: var(--red);
                    font-family: var(--mono);
                    font-size: 0.72rem;
                    font-weight: 700;
                    letter-spacing: 1px;
                    padding: 12px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all .2s;
                    width: 100%;
                }
                .db-kill-btn:hover:not(:disabled) {
                    background: rgba(255,51,85,0.12);
                    box-shadow: 0 0 20px rgba(255,51,85,0.15);
                }
                .db-kill-btn:disabled { opacity: .5; cursor: not-allowed; }
                .db-modal-kill-zone p {
                    font-family: var(--mono);
                    font-size: 0.65rem;
                    color: var(--muted);
                    margin-top: 8px;
                    text-align: center;
                }
                .db-killed-banner {
                    background: rgba(255,51,85,0.07);
                    border: 1px solid rgba(255,51,85,0.2);
                    color: var(--red);
                    font-family: var(--mono);
                    font-size: 0.8rem;
                    padding: 14px 18px;
                    border-radius: 4px;
                    text-align: center;
                }
            `}</style>
        </div>
    );
}