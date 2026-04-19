import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || "";

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  const { assetID } = req.query;

  if (!assetID) {
    return res.status(400).json({ error: 'Missing assetID parameter' });
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
    return res.status(404).json({ error: 'Asset not found' });
  }
  
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
      const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
      return hostname === cleanDomain || hostname.endsWith(`.${cleanDomain}`);
    });
  }

  // If NOT authorized → block + alert
  if (!isWhitelisted) {
    console.log('🚨 Unauthorized access attempt from:', origin);

    if (process.env.RESEND_API_KEY && asset.owner_email) {
      try {
        await resend.emails.send({
          from: 'Sentinel Alerts <onboarding@resend.dev>',
          to: asset.owner_email,
          subject: `Security alert: Unauthorized access attempt detected`,
          html: `
            <h2>Security Alert</h2>
            <p>We detected an unauthorized access attempt for your protected asset.</p>
            <ul>
              <li><strong>Source:</strong> ${origin}</li>
              <li><strong>Asset:</strong> ${asset.file_name}</li>
              <li><strong>Asset ID:</strong> ${assetID}</li>
              <li><strong>Status:</strong> Blocked</li>
              <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            </ul>
            <p>If this was not expected, please investigate immediately.</p>
          `
        });
      } catch (emailError) {
        console.error('Email failed:', emailError);
      }
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Unauthorized domain'
    });
  }

  // Success → send data
  console.log('✅ Authorized access granted');

  // CRITICAL FIX: Properly handle brain data from Supabase
  let cleanBrain = asset.brain;

  // Case 1: If Supabase returns a Buffer (BYTEA type)
  if (Buffer.isBuffer(asset.brain)) {
    console.log('Converting Buffer to Base64');
    cleanBrain = asset.brain.toString('base64');
  } 
  // Case 2: If it's already a string but might have JSON array format from old bug
  else if (typeof asset.brain === 'string') {
    // Remove any whitespace that might have been added
    cleanBrain = asset.brain.trim();
    
    // If it looks like a JSON array string, try to parse and concatenate
    if (cleanBrain.startsWith('[')) {
      try {
        const parsed = JSON.parse(cleanBrain);
        if (Array.isArray(parsed)) {
          cleanBrain = parsed.join('');
        }
      } catch (e) {
        console.log('Brain is not JSON array, using as-is');
      }
    }
  }

  // Final validation: ensure it's valid Base64
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Pattern.test(cleanBrain)) {
    console.error('Invalid Base64 format detected');
    return res.status(500).json({ error: 'Corrupted brain data' });
  }

  console.log('Brain data length:', cleanBrain.length);

  return res.status(200).json({
    brain: cleanBrain,
    key: asset.key,
    kid: asset.kid,
    success: true
  });
}