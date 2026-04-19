// api/unlock.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    const origin = req.headers.origin || req.headers.referer || '';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method Not Allowed' });

    const { assetID } = req.query;

    // Guard against placeholder / missing IDs
    if (!assetID || assetID === 'YOUR-ASSET-ID') {
        return res.status(400).json({ error: 'Missing or invalid assetID' });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(assetID)) {
        return res.status(400).json({ error: 'Invalid assetID format' });
    }

    // Require the client's RSA public key
    const { publicKey: clientPublicKeyB64 } = req.body || {};
    if (!clientPublicKeyB64) {
        return res.status(400).json({ error: 'Missing publicKey in request body' });
    }

    console.log('Unlock request — asset:', assetID, '| origin:', origin);

    // ── Fetch asset from DB ──────────────────────────────────────────────────
    const { data: asset, error } = await supabase
        .from('assets')
        .select('*')
        .eq('id', assetID)
        .single();

    if (error || !asset) {
        console.error('DB error:', error);
        return res.status(404).json({ error: 'Asset not found' });
    }

    // ── Domain whitelist check ───────────────────────────────────────────────
    let isWhitelisted = false;

    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        isWhitelisted = true;
    } else if (asset.whitelist) {
        const list = Array.isArray(asset.whitelist)
            ? asset.whitelist
            : asset.whitelist.split(',');

        let hostname = '';
        try { hostname = new URL(origin).hostname; }
        catch { hostname = origin.replace(/^https?:\/\//, '').split('/')[0]; }

        isWhitelisted = list.some(d => {
            const clean = d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
            return hostname === clean || hostname.endsWith('.' + clean);
        });
    }

    if (!isWhitelisted) {
        console.log('BLOCKED:', origin);

        if (process.env.RESEND_API_KEY && asset.owner_email) {
            try {
                await resend.emails.send({
                    from:    'Sentinel Alerts <onboarding@resend.dev>',
                    to:      asset.owner_email,
                    subject: 'Security alert: Unauthorized access attempt',
                    html: `<h2>Security Alert</h2>
                           <p><strong>Source:</strong> ${origin}</p>
                           <p><strong>Asset:</strong> ${asset.file_name} (${assetID})</p>
                           <p><strong>Time:</strong> ${new Date().toISOString()}</p>`
                });
            } catch (e) { console.error('Email failed:', e); }
        }

        return res.status(403).json({ error: 'Forbidden', message: 'Unauthorized domain' });
    }

    // ── Normalize brain ──────────────────────────────────────────────────────
    let brain = asset.brain;
    if (Buffer.isBuffer(brain)) {
        brain = brain.toString('base64');
    } else if (typeof brain === 'string') {
        brain = brain.trim();
        if (brain.startsWith('[')) {
            try { const p = JSON.parse(brain); if (Array.isArray(p)) brain = p.join(''); } catch {}
        }
    }

    const b64Pattern = /^[A-Za-z0-9+/]+=*$/;
    if (!b64Pattern.test(brain)) {
        console.error('Invalid base64 brain');
        return res.status(500).json({ error: 'Corrupted brain data' });
    }

    // ── RSA-OAEP encrypt the sensitive payload with client's public key ──────
    // The payload { brain, key, kid } is encrypted in Node using the client's
    // one-time RSA public key. The network tab shows only opaque binary —
    // the raw key and brain are never transmitted in plaintext.
    //
    // RSA-OAEP with 2048-bit key can encrypt max ~214 bytes. Our payload
    // (brain ~1872 chars base64 + 32+32 hex) is too large for direct RSA,
    // so we use HYBRID encryption:
    //   1. Generate a one-time AES-256-GCM session key server-side
    //   2. Encrypt the JSON payload with AES-GCM
    //   3. Encrypt the session key with client's RSA public key
    //   4. Send both to client — client RSA-decrypts the session key,
    //      then AES-decrypts the payload
    try {
        // Import client's RSA public key (DER/SPKI base64)
        const clientPubKeyDer = Buffer.from(clientPublicKeyB64, 'base64');

        // Generate one-time AES-256-GCM session key
        const sessionKey = crypto.randomBytes(32);
        const iv         = crypto.randomBytes(12);

        // Encrypt payload with AES-256-GCM
        const plaintext  = JSON.stringify({ brain, key: asset.key, kid: asset.kid });
        const cipher     = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
        const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const authTag    = cipher.getAuthTag();

        // Encrypt session key with client RSA public key
        const encryptedSessionKey = crypto.publicEncrypt(
            {
                key:     crypto.createPublicKey({ key: clientPubKeyDer, format: 'der', type: 'spki' }),
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            sessionKey
        );

        console.log('Authorized — payload encrypted with RSA+AES hybrid');

        // Client receives: RSA-encrypted session key + AES-GCM ciphertext
        return res.status(200).json({
            // RSA-encrypted AES session key
            wrappedKey: encryptedSessionKey.toString('base64'),
            // AES-GCM encrypted payload
            iv:         iv.toString('base64'),
            ciphertext: encrypted.toString('base64'),
            tag:        authTag.toString('base64'),
        });

    } catch (encErr) {
        console.error('Encryption error:', encErr);
        return res.status(500).json({ error: 'Server encryption failed: ' + encErr.message });
    }
}