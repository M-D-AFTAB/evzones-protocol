// api/unlock.js
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY MODEL (V2)
// ───────────────────
// The client HTML contains:
//   BRICK_B64       — the AES-encrypted video body (safe to embed, useless alone)
//   ENC_KEYS_B64    — the per-segment AES keys, themselves AES-256-GCM encrypted
//                     under the "asset transport key"
//
// The asset transport key is derived server-side as:
//   masterKey     = SEGMENT_MASTER_KEY (env var, 32 bytes hex)
//   assetKey      = HMAC-SHA256(masterKey, assetSecret)    ← per-asset
//   transportKey  = assetKey   (32 bytes, used as AES-256-GCM key)
//
// On unlock:
//   1. Client generates ephemeral RSA-2048 keypair
//   2. Client sends RSA public key (SPKI/DER/Base64) to this endpoint
//   3. Server derives transportKey, encrypts it with RSA-OAEP (hybrid)
//   4. Client RSA-decrypts to get transportKey
//   5. Client AES-GCM-decrypts ENC_KEYS_B64 to get raw tempKeys[]
//   6. Client decrypts each brick segment with its tempKey
//   7. Client stitches brain + brick and plays via MSE or Safari blob
//
// This means:
//   ✓ Raw segment keys NEVER touch the network after the save call
//   ✓ Network tab shows only opaque RSA+AES ciphertext
//   ✓ Kill switch: asset.killed = true → immediate 403 worldwide
//   ✓ Domain whitelist enforced before any key material is sent
//   ✓ CORS headers are always set, even on error paths
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    // ── CORS — MUST be the absolute first operation, no exceptions ──────────
    // If CORS headers are missing on ANY response (including errors), the
    // browser will block the response and report a CORS failure, hiding
    // the real error code. This was the primary bug in the upgrade attempt.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method Not Allowed' });

    const origin = req.headers.origin || req.headers.referer || '';

    try {
        // ── Validate assetID ────────────────────────────────────────────────
        const { assetID } = req.query;
        if (!assetID || assetID === 'YOUR-ASSET-ID') {
            return res.status(400).json({ error: 'Missing or invalid assetID' });
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(assetID)) {
            return res.status(400).json({ error: 'Invalid assetID format' });
        }

        // ── Validate request body ───────────────────────────────────────────
        const { publicKey: clientPublicKeyB64 } = req.body || {};
        if (!clientPublicKeyB64) {
            return res.status(400).json({ error: 'Missing publicKey in request body' });
        }

        // ── Validate server config ──────────────────────────────────────────
        if (!process.env.SEGMENT_MASTER_KEY) {
            console.error('FATAL: SEGMENT_MASTER_KEY env var not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        console.log(`Unlock — asset: ${assetID} | origin: ${origin}`);

        // ── Fetch asset ─────────────────────────────────────────────────────
        const { data: asset, error: dbError } = await supabase
            .from('assets')
            .select('*')
            .eq('id', assetID)
            .single();

        if (dbError || !asset) {
            console.error('DB error:', dbError);
            return res.status(404).json({ error: 'Asset not found' });
        }

        // ── Kill switch ─────────────────────────────────────────────────────
        if (asset.killed) {
            console.log(`Asset ${assetID} is killed`);
            return res.status(403).json({ error: 'This asset has been deactivated by the owner' });
        }

        // ── Domain whitelist ────────────────────────────────────────────────
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

            // Fire alert email (non-blocking — don't let email failure block response)
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

        // ── Normalize brain ─────────────────────────────────────────────────
        let brain = asset.brain;
        if (Buffer.isBuffer(brain)) {
            brain = brain.toString('base64');
        } else if (typeof brain === 'string') {
            brain = brain.trim().replace(/\s/g, '');
            // Handle legacy array-stringified brain
            if (brain.startsWith('[')) {
                try {
                    const parsed = JSON.parse(brain);
                    if (Array.isArray(parsed)) brain = parsed.join('');
                } catch { /* ignore */ }
            }
        }

        const b64Pattern = /^[A-Za-z0-9+/]+=*$/;
        if (!b64Pattern.test(brain)) {
            console.error('Invalid base64 brain for asset', assetID);
            return res.status(500).json({ error: 'Corrupted brain data' });
        }

        // ── Derive asset transport key ──────────────────────────────────────
        // transportKey = HMAC-SHA256(HMAC-SHA256(MASTER_KEY, assetSecret))
        // This is a deterministic per-asset key that the server can always
        // re-derive without storing it. The client uses it to decrypt the
        // ENC_KEYS_B64 blob embedded in the HTML asset.
        const transportKey = deriveTransportKey(asset.asset_secret);

        // ── Build payload ───────────────────────────────────────────────────
        // We send: brain (moov/ftyp init segment) + the transport key.
        // The transport key lets the client decrypt ENC_KEYS_B64 (embedded
        // in the HTML) to recover the per-segment AES keys for the brick.
        const payload = {
            brain,
            transportKey: transportKey.toString('hex'),
            segmentCount: asset.segment_count
        };

        // ── Hybrid RSA+AES encrypt the payload ─────────────────────────────
        const encrypted = await hybridEncrypt(JSON.stringify(payload), clientPublicKeyB64);

        console.log(`Authorized: ${requestHostname} → asset ${assetID}`);
        return res.status(200).json(encrypted);

    } catch (err) {
        console.error('Unlock handler error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHostname(raw) {
    if (!raw) return '';
    raw = raw.trim().toLowerCase();
    try {
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
    // Two-level HMAC derivation:
    // Level 1: assetKey  = HMAC(masterKey, assetSecret)  → ties key to this server
    // Level 2: transportKey = HMAC(assetKey, 'transport') → domain-separated
    const masterKey    = Buffer.from(process.env.SEGMENT_MASTER_KEY, 'hex');
    const assetKey     = crypto.createHmac('sha256', masterKey).update(assetSecret).digest();
    const transportKey = crypto.createHmac('sha256', assetKey).update('transport').digest();
    return transportKey; // 32 bytes
}

async function hybridEncrypt(plaintext, clientPublicKeyB64) {
    // 1. Generate one-time AES-256-GCM session key
    const sessionKey = crypto.randomBytes(32);
    const iv         = crypto.randomBytes(12);

    // 2. AES-GCM encrypt the plaintext payload
    const cipher    = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag   = cipher.getAuthTag();

    // 3. RSA-OAEP encrypt the session key with the client's ephemeral public key
    const clientPubKeyDer     = Buffer.from(clientPublicKeyB64, 'base64');
    const encryptedSessionKey = crypto.publicEncrypt(
        {
            key:     crypto.createPublicKey({ key: clientPubKeyDer, format: 'der', type: 'spki' }),
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
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