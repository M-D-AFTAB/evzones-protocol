// api/checkpoint.js
// Records viewer sessions and heartbeat pings for live tracking dashboard.
// Called twice per viewer:
//   1. On playback start (no sessionID) → creates session, returns sessionID
//   2. Every 15s during playback        → updates checkpoint + last_seen

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // CORS must be first
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')   return res.status(405).end();

    try {
        const { assetID, sessionID, checkpoint, viewerURL } = req.body || {};

        if (!assetID) return res.status(400).json({ error: 'Missing assetID' });

        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
        const ua = req.headers['user-agent'] || '';

        if (sessionID) {
            // Heartbeat ping — update existing session
            const { error } = await supabase
                .from('sessions')
                .update({
                    checkpoint: Math.max(0, parseInt(checkpoint) || 0),
                    last_seen:  new Date().toISOString()
                })
                .eq('id', sessionID);

            if (error) console.error('Session update error:', error);
            return res.status(200).json({ ok: true });

        } else {
            // New session
            const { data, error } = await supabase
                .from('sessions')
                .insert([{
                    asset_id:   assetID,
                    viewer_ip:  ip,
                    viewer_ua:  ua,
                    viewer_url: viewerURL || '',
                    checkpoint: 0,
                    last_seen:  new Date().toISOString()
                }])
                .select('id')
                .single();

            if (error) {
                console.error('Session insert error:', error);
                return res.status(500).json({ error: 'Failed to create session' });
            }

            return res.status(200).json({ sessionID: data.id });
        }

    } catch (err) {
        console.error('Checkpoint error:', err);
        return res.status(500).json({ error: err.message });
    }
}