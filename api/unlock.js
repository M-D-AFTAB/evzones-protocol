// api/unlock.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const { assetID } = req.query;

  // FIX: Guard against the literal string "YOUR-ASSET-ID" that appears in
  // the Vercel logs — this means the HTML was generated before a real asset
  // ID was available.
  if (!assetID || assetID === 'YOUR-ASSET-ID') {
    return res.status(400).json({
      error: 'Missing or invalid assetID parameter',
      hint:  'The HTML file contains a placeholder asset ID. Re-generate the Smart Asset after a successful vault save.'
    });
  }

  // Basic UUID format check — catches malformed IDs before hitting Supabase
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(assetID)) {
    return res.status(400).json({
      error: 'Invalid assetID format — expected a UUID',
      received: assetID
    });
  }

  console.log('Unlock request for asset:', assetID);
  console.log('Origin:', origin);

  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetID)
    .single();

  if (error || !asset) {
    console.error('Database error:', error);
    return res.status(404).json({ error: 'Asset not found', supabaseError: error?.message });
  }

  // ── Domain whitelist check ───────────────────────────────────────────────
  let isWhitelisted = false;

  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    isWhitelisted = true;
  } else if (asset.whitelist) {
    const whitelistArray = Array.isArray(asset.whitelist)
      ? asset.whitelist
      : asset.whitelist.split(',');

    let hostname = '';
    try {
      hostname = new URL(origin).hostname;
    } catch {
      hostname = origin.replace(/^https?:\/\//, '').split('/')[0];
    }

    isWhitelisted = whitelistArray.some(domain => {
      const cleanDomain = domain.trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      return hostname === cleanDomain || hostname.endsWith(`.${cleanDomain}`);
    });
  }

  if (!isWhitelisted) {
    console.log('🚨 Unauthorized access attempt from:', origin);

    if (process.env.RESEND_API_KEY && asset.owner_email) {
      try {
        await resend.emails.send({
          from:    'Sentinel Alerts <onboarding@resend.dev>',
          to:      asset.owner_email,
          subject: 'Security alert: Unauthorized access attempt detected',
          html: `
            <h2>Security Alert</h2>
            <p>Unauthorized access attempt for your protected asset.</p>
            <ul>
              <li><strong>Source:</strong> ${origin}</li>
              <li><strong>Asset:</strong> ${asset.file_name}</li>
              <li><strong>Asset ID:</strong> ${assetID}</li>
              <li><strong>Status:</strong> Blocked</li>
              <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            </ul>
          `
        });
      } catch (emailError) {
        console.error('Alert email failed:', emailError);
      }
    }

    return res.status(403).json({ error: 'Forbidden', message: 'Unauthorized domain' });
  }

  // ── Normalize brain data from Supabase ───────────────────────────────────
  let cleanBrain = asset.brain;

  if (Buffer.isBuffer(asset.brain)) {
    // Supabase returned BYTEA — convert to Base64 string
    console.log('Converting Buffer to Base64');
    cleanBrain = asset.brain.toString('base64');
  } else if (typeof asset.brain === 'string') {
    cleanBrain = asset.brain.trim();
    // Legacy: if stored as JSON array string, rejoin
    if (cleanBrain.startsWith('[')) {
      try {
        const parsed = JSON.parse(cleanBrain);
        if (Array.isArray(parsed)) cleanBrain = parsed.join('');
      } catch {
        // Not JSON — use as-is
      }
    }
  }

  // Validate Base64 format
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Pattern.test(cleanBrain)) {
    console.error('Invalid Base64 detected. Brain preview:', cleanBrain.substring(0, 80));
    return res.status(500).json({ error: 'Corrupted brain data — invalid Base64 format' });
  }

  console.log('✅ Authorized. Brain length:', cleanBrain.length);

  return res.status(200).json({
    brain:   cleanBrain,
    key:     asset.key,
    kid:     asset.kid,
    success: true
  });
}