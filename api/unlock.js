import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // 1. Handle CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*'); // Restricted to specific origin in prod
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { assetID } = req.query;
  const origin = req.headers.origin || req.headers.referer || "Unknown Site";

  // 2. Fetch Asset from Supabase
  const { data: asset, error } = await supabase.from('assets').select('*').eq('id', assetID).single();
  if (error || !asset) return res.status(404).json({ error: 'Asset not found' });

  // 3. Domain Check
  const isWhitelisted = asset.whitelist.some(domain => origin.includes(domain.trim()));

  if (!isWhitelisted) {
    // 🚨 PIRACY ALERT: Send email via Resend
    await resend.emails.send({
      from: 'Sentinel <alerts@resend.dev>',
      to: asset.owner_email,
      subject: `🚨 ALERT: Piracy Attempt on ${asset.file_name}`,
      html: `
        <h2>Piracy Attempt Detected</h2>
        <p>A website tried to host your video without permission.</p>
        <ul>
          <li><strong>Source:</strong> ${origin}</li>
          <li><strong>Asset:</strong> ${asset.file_name}</li>
          <li><strong>Result:</strong> <strong>BLOCKED</strong> (Data stayed as a 'Brick')</li>
        </ul>`
    });
    return res.status(403).json({ error: 'Forbidden: Unauthorized Domain' });
  }

  // 4. Success: Send Brain + Key
  res.status(200).json({ brain: asset.brain, key: asset.key, kid: asset.kid });
}
