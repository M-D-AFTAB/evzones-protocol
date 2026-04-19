import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Simple in-memory rate limiter
const requests = {};

export default async function handler(req, res) {
  // 1. Handle CORS Preflight
  const origin = req.headers.origin || req.headers.referer || "";

  const allowedOrigins = ['https://yourdomain.com']; // 🔁 CHANGE THIS

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 2. Allow only POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 3. Rate Limiting
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!requests[ip]) {
    requests[ip] = { count: 1, time: Date.now() };
  } else {
    requests[ip].count++;
  }

  if (requests[ip].count > 10) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // 4. Get assetID
  const { assetID } = req.query;

  if (!assetID) {
    return res.status(400).json({ error: 'Missing assetID parameter' });
  }

  console.log('Unlock request for asset:', assetID);
  console.log('Origin:', origin);

  // 5. Fetch Asset
  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetID)
    .single();

  if (error || !asset) {
    console.error('Database error:', error);
    return res.status(404).json({ error: 'Asset not found' });
  }

  // 6. Secure Domain Check
  let isWhitelisted = false;

  // Allow localhost for dev
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    isWhitelisted = true;
  } else if (asset.whitelist && Array.isArray(asset.whitelist)) {
    let hostname = '';

    try {
      hostname = new URL(origin).hostname;
    } catch {
      hostname = '';
    }

    isWhitelisted = asset.whitelist.some(domain => {
      const cleanDomain = domain.trim().toLowerCase();
      return hostname === cleanDomain || hostname.endsWith(`.${cleanDomain}`);
    });
  }

  // 7. If NOT authorized → block + alert
  if (!isWhitelisted) {
    console.log('🚨 Unauthorized access attempt from:', origin);

    if (process.env.RESEND_API_KEY && asset.owner_email) {
      try {
        await resend.emails.send({
          from: 'Sentinel Alerts <alerts@yourdomain.com>', // 🔁 CHANGE THIS (must be verified domain)
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

  // 8. Success → send data
  console.log('✅ Authorized access granted');

  return res.status(200).json({
    brain: asset.brain,
    key: asset.key,
    kid: asset.kid,
    success: true
  });
}