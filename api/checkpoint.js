// api/checkpoint.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')   return res.status(405).end();

    const { assetID, sessionID, checkpoint, viewerURL } = req.body || {};
    if (!assetID) return res.status(400).json({ error: 'Missing assetID' });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const ua = req.headers['user-agent'] || '';

    try {
        if (sessionID) {
            // Update existing session — just bump checkpoint and last_seen
            await supabase
                .from('sessions')
                .update({
                    checkpoint: checkpoint || 0,
                    last_seen:  new Date().toISOString()
                })
                .eq('id', sessionID);

            return res.status(200).json({ ok: true });
        } else {
            // New session — create record and return sessionID
            const { data, error } = await supabase
                .from('sessions')
                .insert([{
                    asset_id:   assetID,
                    viewer_ip:  ip,
                    viewer_ua:  ua,
                    viewer_url: viewerURL || '',
                    checkpoint: 0
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