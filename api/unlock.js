// api/unlock.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeToHostname(raw) {
    if (!raw) return '';
    raw = raw.trim().toLowerCase();
    try {
        const u = new URL(raw.endsWith('/') ? raw.slice(0, -1) : raw);
        return u.hostname;
    } catch {
        return raw
            .replace(/^https?:\/\//, '')
            .split('/')[0]
            .split('?')[0]
            .split('#')[0];
    }
}

function deriveSegmentKey(assetSecret, assetID, segmentIndex) {
    const masterKey = Buffer.from(process.env.SEGMENT_MASTER_KEY, 'hex');
    const assetKey  = crypto.createHmac('sha256', masterKey).update(assetSecret).digest();
    return crypto.createHmac('sha256', assetKey).update(`${assetID}:${segmentIndex}`).digest();
}

async function hybridEncrypt(plaintext, clientPublicKeyB64) {
    const clientPubKeyDer     = Buffer.from(clientPublicKeyB64, 'base64');
    const sessionKey          = crypto.randomBytes(32);
    const iv                  = crypto.randomBytes(12);
    const cipher              = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    const encrypted           = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag             = cipher.getAuthTag();
    const encryptedSessionKey = crypto.publicEncrypt(
        { key: crypto.createPublicKey({ key: clientPubKeyDer, format: 'der', type: 'spki' }),
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        sessionKey
    );
    return {
        wrappedKey: encryptedSessionKey.toString('base64'),
        iv:         iv.toString('base64'),
        ciphertext: encrypted.toString('base64'),
        tag:        authTag.toString('base64')
    };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    const origin = req.headers.origin || req.headers.referer || '';
    const sendAgentLog = (hypothesisId, message, data) => {
        // #region agent log
        fetch('http://127.0.0.1:7791/ingest/7b095153-cf81-4920-9309-1ee34f6a5f68', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '70f25a' },
            body: JSON.stringify({
                sessionId: '70f25a',
                runId: 'pre-fix',
                hypothesisId,
                location: 'api/unlock.js:handler',
                message,
                data,
                timestamp: Date.now()
            })
        }).catch(() => {});
        // #endregion
    };
    // #region agent log
    sendAgentLog('H5', 'unlock handler entry', {
        method: req.method,
        origin,
        url: req.url,
        hasDoubleSlashInUrl: typeof req.url === 'string' ? req.url.includes('//api/') : false
    });
    // #endregion

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        // #region agent log
        sendAgentLog('H3', 'preflight handled', { status: 204, allowMethods: 'POST, OPTIONS' });
        // #endregion
        return res.status(204).end();
    }
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method Not Allowed' });

    const { assetID } = req.query;
    if (!assetID || assetID === 'YOUR-ASSET-ID') {
        return res.status(400).json({ error: 'Missing or invalid assetID' });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(assetID)) {
        return res.status(400).json({ error: 'Invalid assetID format' });
    }

    const { publicKey: clientPublicKeyB64, segmentStart = 0, segmentCount = 20 } = req.body || {};
    if (!clientPublicKeyB64) {
        return res.status(400).json({ error: 'Missing publicKey in request body' });
    }

    const batchSize = Math.min(Math.max(parseInt(segmentCount) || 20, 1), 50);

    console.log(`Unlock — asset: ${assetID} | origin: ${origin} | segs: ${segmentStart}-${segmentStart + batchSize - 1}`);

    const { data: asset, error } = await supabase
        .from('assets').select('*').eq('id', assetID).single();

    if (error || !asset) return res.status(404).json({ error: 'Asset not found' });

    // Kill switch
    if (asset.killed) {
        return res.status(403).json({ error: 'Asset has been deactivated by the owner' });
    }

    // Whitelist check
    let isWhitelisted = false;
    const requestHostname = normalizeToHostname(origin);

    if (!requestHostname || requestHostname === 'localhost' || requestHostname === '127.0.0.1') {
        isWhitelisted = true;
    } else if (asset.whitelist) {
        const list = Array.isArray(asset.whitelist)
            ? asset.whitelist : asset.whitelist.split(',');
        isWhitelisted = list.some(entry => {
            const clean = normalizeToHostname(entry);
            if (!clean) return false;
            return requestHostname === clean || requestHostname.endsWith('.' + clean);
        });
    }

    if (!isWhitelisted) {
        console.log(`BLOCKED: ${origin} (${requestHostname})`);
        if (process.env.RESEND_API_KEY && asset.owner_email) {
            try {
                await resend.emails.send({
                    from:    'Sentinel Alerts <onboarding@resend.dev>',
                    to:      asset.owner_email,
                    subject: 'Security alert: Unauthorized access attempt',
                    html:    `<h2>Security Alert</h2>
                              <p><strong>Source:</strong> ${origin}</p>
                              <p><strong>Hostname:</strong> ${requestHostname}</p>
                              <p><strong>Asset:</strong> ${asset.file_name} (${assetID})</p>
                              <p><strong>Time:</strong> ${new Date().toISOString()}</p>`
                });
            } catch (e) { console.error('Email failed:', e); }
        }
        return res.status(403).json({ error: 'Forbidden', message: 'Unauthorized domain' });
    }

    // Normalize brain
    let brain = asset.brain;
    if (Buffer.isBuffer(brain)) brain = brain.toString('base64');
    else if (typeof brain === 'string') {
        brain = brain.trim().replace(/\s/g, '');
        if (brain.startsWith('[')) {
            try { const p = JSON.parse(brain); if (Array.isArray(p)) brain = p.join(''); } catch {}
        }
    }

    if (!process.env.SEGMENT_MASTER_KEY) {
        return res.status(500).json({ error: 'Server configuration error: missing SEGMENT_MASTER_KEY' });
    }

    // Kill switch ping (segmentStart === -1) — just validates kill status, returns nothing else
    if (parseInt(segmentStart) === -1) {
        return res.status(200).json({ ok: true });
    }

    // Derive segment keys
    const segmentKeys = [];
    for (let i = segmentStart; i < segmentStart + batchSize; i++) {
        segmentKeys.push({
            index: i,
            key:   deriveSegmentKey(asset.asset_secret, assetID, i).toString('hex')
        });
    }

    const payload = parseInt(segmentStart) === 0
        ? { brain, segmentKeys, segmentCount: asset.segment_count }
        : { segmentKeys };

    try {
        const encrypted = await hybridEncrypt(JSON.stringify(payload), clientPublicKeyB64);
        return res.status(200).json(encrypted);
    } catch (encErr) {
        console.error('Encryption error:', encErr);
        return res.status(500).json({ error: 'Server encryption failed: ' + encErr.message });
    }
}