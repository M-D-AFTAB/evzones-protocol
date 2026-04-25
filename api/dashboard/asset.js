// api/dashboard/asset.js
// GET /api/dashboard/asset?id=<uuid>
// Returns a single asset with its sessions (used by the live tracking modal
// to refresh every 5 seconds without reloading all assets).

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET')    return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id' });

        const { data: asset, error: aErr } = await supabase
            .from('assets')
            .select('id, file_name, segment_count, whitelist, killed, created_at')
            .eq('id', id)
            .single();

        if (aErr || !asset) return res.status(404).json({ error: 'Asset not found' });

        const { data: sessions } = await supabase
            .from('sessions')
            .select('id, viewer_ip, checkpoint, last_seen, viewer_url')
            .eq('asset_id', id)
            .order('last_seen', { ascending: false });

        return res.status(200).json({ ...asset, sessions: sessions || [] });

    } catch (err) {
        console.error('Asset endpoint error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}