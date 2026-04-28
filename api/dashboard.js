// api/dashboard.js
// Returns all assets owned by an email address, with their live session data.
// Sessions are joined server-side so the client gets everything in one call.
//
// GET /api/dashboard?email=owner@example.com
//
// Response:
// {
//   assets: [{
//     id, file_name, segment_count, whitelist, killed, created_at,
//     sessions: [{ id, viewer_ip, checkpoint, last_seen, viewer_url }]
//   }]
// }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // CORS — always first
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET')    return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { email } = req.query;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Missing or invalid email' });
        }

        // Fetch all assets for this owner
        const { data: assets, error: assetErr } = await supabase
            .from('assets')
            .select('id, file_name, segment_count, whitelist, killed, created_at')
            .eq('owner_email', email)
            .order('created_at', { ascending: false });

        if (assetErr) {
            console.error('Assets query error:', assetErr);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!assets || assets.length === 0) {
            return res.status(200).json({ assets: [] });
        }

        // Fetch all sessions for these assets in one query
        const assetIDs = assets.map(a => a.id);

        const { data: sessions, error: sessionErr } = await supabase
            .from('sessions')
            .select('id, asset_id, viewer_ip, checkpoint, last_seen, viewer_url')
            .in('asset_id', assetIDs)
            .order('last_seen', { ascending: false });

        if (sessionErr) {
            console.error('Sessions query error:', sessionErr);
            // Non-fatal — return assets without session data
        }

        // Join sessions into their parent assets
        const sessionMap = {};
        for (const s of (sessions || [])) {
            if (!sessionMap[s.asset_id]) sessionMap[s.asset_id] = [];
            sessionMap[s.asset_id].push({
                id:          s.id,
                viewer_ip:   s.viewer_ip,
                checkpoint:  s.checkpoint,
                last_seen:   s.last_seen,
                viewer_url:  s.viewer_url
            });
        }

        const enriched = assets.map(a => ({
            ...a,
            sessions: sessionMap[a.id] || []
        }));

        return res.status(200).json({ assets: enriched });

    } catch (err) {
        console.error('Dashboard error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Also export a single-asset endpoint used by the live tracking modal
// GET /api/dashboard/asset?id=<uuid>
// Note: in Vercel you'd put this in /api/dashboard/asset.js
// but since we use rewrites, adding it here as documentation.
// Create /api/dashboard/asset.js separately (see below).