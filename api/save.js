// api/save.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { brain, segmentCount, whitelist, email, fileName } = req.body;

    if (!brain || !email || !fileName) {
        return res.status(400).json({ error: 'Missing required fields: brain, email, fileName' });
    }

    // Generate unique per-asset secret — never sent to client
    // Used server-side only for HMAC key derivation
    const assetSecret = crypto.randomBytes(32).toString('hex');

    const { data, error } = await supabase.from('assets').insert([{
        brain,
        asset_secret:  assetSecret,
        segment_count: segmentCount || 0,
        whitelist:     Array.isArray(whitelist) ? whitelist : [whitelist],
        owner_email:   email,
        file_name:     fileName
    }]).select('id');

    if (error) {
        console.error('Supabase insert error:', error);
        return res.status(500).json(error);
    }

    return res.status(200).json({ assetID: data[0].id });
}