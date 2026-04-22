// api/save.js
// ─────────────────────────────────────────────────────────────────────────────
// Receives: brain (Base64 init segment) + encryptedTempKeys (per-segment keys
//           already AES-wrapped by the client so the server never sees raw keys)
//           + segmentCount, whitelist, email, fileName
//
// Stores:   brain + asset_secret (server-generated) + segment_count
//           The encryptedTempKeys are NOT stored — they ride inside the HTML.
//           On unlock, the server derives a "transport key" from asset_secret
//           and re-encrypts whatever the client sends back.
//
// DESIGN NOTE on key architecture
// ────────────────────────────────
// The upgrade attempt broke because it tried to do TWO things at once:
//   1. Encrypt the brick with random tempKeys on the client
//   2. Re-derive those same keys on the server via HMAC
// These are mutually exclusive — you can't derive a key you never saw.
//
// The correct V2 architecture is:
//   • Client encrypts each segment with a random key (tempKey[i])
//   • Client sends tempKey[i] values to the server inside the save request,
//     wrapped under a server RSA public key (so the server sees them once
//     at ingest time and stores them encrypted, OR:)
//   • Simpler/cheaper: tempKeys are embedded INSIDE the HTML asset,
//     but themselves AES-encrypted with a "asset transport key" that ONLY
//     the vault can issue (via the RSA handshake).
//
// That is what this implementation does:
//   save.js   → stores brain + asset_secret; client embeds AES-encrypted
//               tempKeys blob in the HTML
//   unlock.js → derives the "asset transport key" from asset_secret + SEGMENT_MASTER_KEY,
//               encrypts it with the client RSA pub key, returns it
//   HTML      → uses transport key to decrypt tempKeys, then tempKeys to decrypt brick
//
// This way:
//   ✓ Server never stores raw tempKeys (they live only in the HTML, encrypted)
//   ✓ HMAC derivation is used for the transport key, not the segment keys
//   ✓ The network tab shows only opaque RSA+AES ciphertext
//   ✓ The brick encrypted with unique per-segment keys (forward secrecy)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // CORS MUST be set before anything else — any early return without these
    // headers causes the browser to see a CORS failure, masking the real error
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { brain, segmentCount, whitelist, email, fileName } = req.body || {};

        if (!brain || !email || !fileName) {
            return res.status(400).json({ error: 'Missing required fields: brain, email, fileName' });
        }

        if (!process.env.SEGMENT_MASTER_KEY) {
            console.error('FATAL: SEGMENT_MASTER_KEY env var is not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Generate a unique per-asset secret.
        // This is stored in the DB and is used server-side ONLY to derive
        // the "asset transport key" that unlocks the encrypted tempKeys blob.
        // It is never transmitted to any client.
        const assetSecret = crypto.randomBytes(32).toString('hex');

        const { data, error } = await supabase.from('assets').insert([{
            brain,
            asset_secret:  assetSecret,
            segment_count: Math.max(0, parseInt(segmentCount) || 0),
            whitelist:     Array.isArray(whitelist) ? whitelist.filter(Boolean) : [],
            owner_email:   email,
            file_name:     fileName,
            killed:        false
        }]).select('id');

        if (error) {
            console.error('Supabase insert error:', error);
            return res.status(500).json({ error: 'Database error', detail: error.message });
        }

        return res.status(200).json({ assetID: data[0].id });

    } catch (err) {
        console.error('Save handler error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}