// api/unlock.js
// ─────────────────────────────────────────────────────────────────────────────
// TWO CALL MODES
// ──────────────
// 1. INGEST MODE: called by evzonesEngine.js right after /api/save.
//    Body includes `ingestToken` — an HMAC derived from assetSecret.
//    Bypasses the domain whitelist. Lets the Studio encrypt tempKeys[].
//
// 2. PLAYBACK MODE: called by the HTML asset in a viewer's browser.
//    No ingestToken. Full domain whitelist check applies.
//
// INGEST TOKEN
// ────────────
// ingestToken = HMAC(HMAC(masterKey, assetSecret), 'ingest')
// Server re-derives and compares in constant time (timingSafeEqual).
// Each asset has a unique token — a leak only affects that one asset.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    // CORS — unconditionally first
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method Not Allowed' });

    const origin = req.headers.origin || req.headers.referer || '';

    try {
        // Validate assetID
        const { assetID } = req.query;
        if (!assetID || assetID === 'YOUR-ASSET-ID') {
            return res.status(400).json({ error: 'Missing or invalid assetID' });
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(assetID)) {
            return res.status(400).json({ error: 'Invalid assetID format' });
        }

        const { publicKey: clientPublicKeyB64, ingestToken } = req.body || {};
        if (!clientPublicKeyB64) {
            return res.status(400).json({ error: 'Missing publicKey in request body' });
        }

        if (!process.env.SEGMENT_MASTER_KEY) {
            console.error('FATAL: SEGMENT_MASTER_KEY env var not set');
            return res.status(500).json({ error: 'Server configuration error: missing SEGMENT_MASTER_KEY' });
        }

        console.log(`Unlock — asset: ${assetID} | origin: ${origin} | ingest: ${!!ingestToken}`);

        // Fetch asset
        const { data: asset, error: dbError } = await supabase
            .from('assets')
            .select('*')
            .eq('id', assetID)
            .single();

        if (dbError || !asset) {
            console.error('DB error:', dbError);
            return res.status(404).json({ error: 'Asset not found' });
        }

        // Kill switch — checked before anything else
        if (asset.killed) {
            console.log(`Asset ${assetID} is killed`);
            return res.status(403).json({ error: 'This asset has been deactivated by the owner' });
        }

        // ── Ingest token check ───────────────────────────────────────────────
        // If ingestToken is present, verify it. Valid token = skip whitelist.
        // Invalid token = hard block (don't fall through to whitelist logic).
        let isIngestCall = false;
        if (ingestToken) {
            const expectedToken = deriveIngestToken(asset.asset_secret);
            const provided = Buffer.from(ingestToken, 'hex');
            if (provided.length === expectedToken.length &&
                crypto.timingSafeEqual(provided, expectedToken)) {
                isIngestCall = true;
                console.log(`Ingest token valid — asset: ${assetID}`);
            } else {
                console.warn(`Invalid ingest token for asset: ${assetID}`);
                return res.status(403).json({ error: 'Invalid ingest token' });
            }
        }

        // ── Domain whitelist (playback mode only) ────────────────────────────
        if (!isIngestCall) {
            const requestHostname = normalizeHostname(origin);
            let isWhitelisted = false;

            if (!requestHostname || requestHostname === 'localhost' || requestHostname === '127.0.0.1') {
                isWhitelisted = true;
            } else if (asset.whitelist && asset.whitelist.length > 0) {
                const list = Array.isArray(asset.whitelist)
                    ? asset.whitelist
                    : asset.whitelist.split(',');

                isWhitelisted = list.some(entry => {
                    const clean = normalizeHostname(entry);
                    if (!clean) return false;
                    return requestHostname === clean || requestHostname.endsWith('.' + clean);
                });
            }

            if (!isWhitelisted) {
                console.log(`BLOCKED: ${origin} (${requestHostname})`);

                if (process.env.RESEND_API_KEY && asset.owner_email) {
                    resend.emails.send({
                        from:    'Sentinel Alerts <onboarding@resend.dev>',
                        to:      asset.owner_email,
                        subject: 'Security Alert: Unauthorized Access Attempt',
                        html: `<h2>Security Alert</h2>
                               <p><strong>Source:</strong> ${escapeHtml(origin)}</p>
                               <p><strong>Hostname:</strong> ${escapeHtml(requestHostname)}</p>
                               <p><strong>Asset:</strong> ${escapeHtml(asset.file_name)} (${assetID})</p>
                               <p><strong>Time:</strong> ${new Date().toISOString()}</p>`
                    }).catch(e => console.error('Alert email failed:', e));
                }

                return res.status(403).json({ error: 'Forbidden', message: 'Unauthorized domain' });
            }

            console.log(`Authorized: ${requestHostname} → asset ${assetID}`);
        }

        // ── Normalize brain ──────────────────────────────────────────────────
        let brain = asset.brain;
        if (Buffer.isBuffer(brain)) {
            brain = brain.toString('base64');
        } else if (typeof brain === 'string') {
            brain = brain.trim().replace(/\s/g, '');
            if (brain.startsWith('[')) {
                try {
                    const parsed = JSON.parse(brain);
                    if (Array.isArray(parsed)) brain = parsed.join('');
                } catch { /* ignore */ }
            }
        }

        if (!/^[A-Za-z0-9+/]+=*$/.test(brain)) {
            console.error('Invalid base64 brain for asset', assetID);
            return res.status(500).json({ error: 'Corrupted brain data' });
        }

        // ── Derive transport key and return RSA-encrypted payload ────────────
        const transportKey = deriveTransportKey(asset.asset_secret);

        const payload = {
            brain,
            transportKey: transportKey.toString('hex'),
            segmentCount: asset.segment_count
        };

        const encrypted = await hybridEncrypt(JSON.stringify(payload), clientPublicKeyB64);
        return res.status(200).json(encrypted);

    } catch (err) {
        console.error('Unlock handler error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeHostname(raw) {
    if (!raw) return '';
    raw = raw.trim().toLowerCase();
    try {
        // WHATWG URL API — avoids deprecated url.parse()
        return new URL(raw).hostname;
    } catch {
        return raw
            .replace(/^https?:\/\//, '')
            .split('/')[0]
            .split('?')[0]
            .split('#')[0];
    }
}

function deriveTransportKey(assetSecret) {
    const masterKey = Buffer.from(process.env.SEGMENT_MASTER_KEY, 'hex');
    const assetKey  = crypto.createHmac('sha256', masterKey).update(assetSecret).digest();
    return crypto.createHmac('sha256', assetKey).update('transport').digest();
}

function deriveIngestToken(assetSecret) {
    // Same structure as transport key but with 'ingest' domain label —
    // cryptographically distinct, can't be used as a transport key or vice versa
    const masterKey = Buffer.from(process.env.SEGMENT_MASTER_KEY, 'hex');
    const assetKey  = crypto.createHmac('sha256', masterKey).update(assetSecret).digest();
    return crypto.createHmac('sha256', assetKey).update('ingest').digest();
}

async function hybridEncrypt(plaintext, clientPublicKeyB64) {
    const sessionKey = crypto.randomBytes(32);
    const iv         = crypto.randomBytes(12);
    const cipher     = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag    = cipher.getAuthTag();

    const clientPubKeyDer     = Buffer.from(clientPublicKeyB64, 'base64');
    const encryptedSessionKey = crypto.publicEncrypt(
        {
            key:      crypto.createPublicKey({ key: clientPubKeyDer, format: 'der', type: 'spki' }),
            padding:  crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        sessionKey
    );

    return {
        wrappedKey: encryptedSessionKey.toString('base64'),
        iv:         iv.toString('base64'),
        ciphertext: encrypted.toString('base64'),
        tag:        authTag.toString('base64')
    };
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}