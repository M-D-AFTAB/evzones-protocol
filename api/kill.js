// api/kill.js
// POST /api/kill
// Body: { assetID, ownerEmail }
// Marks an asset as killed (revokes all future playback)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { assetID, ownerEmail } = req.body;
        if (!assetID || !ownerEmail) {
            return res.status(400).json({ error: 'Missing assetID or ownerEmail' });
        }

        // First, verify the asset belongs to this owner
        const { data: asset, error: fetchErr } = await supabase
            .from('assets')
            .select('owner_email')
            .eq('id', assetID)
            .single();

        if (fetchErr || !asset) {
            return res.status(404).json({ error: 'Asset not found' });
        }

        if (asset.owner_email !== ownerEmail) {
            return res.status(403).json({ error: 'Not authorized to kill this asset' });
        }

        // Update the asset: set killed = true
        const { error: updateErr } = await supabase
            .from('assets')
            .update({ killed: true })
            .eq('id', assetID);

        if (updateErr) {
            console.error('Kill update error:', updateErr);
            return res.status(500).json({ error: 'Failed to kill asset' });
        }

        return res.status(200).json({ ok: true, message: 'Asset killed successfully' });

    } catch (err) {
        console.error('Kill handler error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}