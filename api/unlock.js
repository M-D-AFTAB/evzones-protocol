import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // 1. Handle CORS Preflight
  const origin = req.headers.origin || req.headers.referer || "Unknown";
  
  res.setHeader('Access-Control-Allow-Origin', '*'); // In production, restrict to your domains
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Support both GET and POST
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Get assetID from query parameter
  const { assetID } = req.query;
  
  if (!assetID) {
    return res.status(400).json({ error: 'Missing assetID parameter' });
  }

  console.log('Unlock request for asset:', assetID);
  console.log('Origin:', origin);

  // 3. Fetch Asset from Supabase
  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetID)
    .single();

  if (error) {
    console.error('Database error:', error);
    return res.status(404).json({ error: 'Asset not found', details: error.message });
  }

  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // 4. Domain Check
  let isWhitelisted = false;
  
  // Allow localhost for development
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    isWhitelisted = true;
    console.log('Localhost access allowed for development');
  } else if (asset.whitelist && Array.isArray(asset.whitelist)) {
    isWhitelisted = asset.whitelist.some(domain => {
      const cleanDomain = domain.trim().toLowerCase();
      const cleanOrigin = origin.toLowerCase();
      return cleanOrigin.includes(cleanDomain);
    });
  }

  if (!isWhitelisted) {
    console.log('🚨 PIRACY ATTEMPT - Unauthorized domain:', origin);
    
    // Send email alert via Resend (only if RESEND_API_KEY is configured)
    if (process.env.RESEND_API_KEY && asset.owner_email) {
      try {
        await resend.emails.send({
          from: 'Sentinel Alerts <onboarding@resend.dev>', // Use verified domain in production
          to: asset.owner_email,
          subject: `🚨 ALERT: Piracy Attempt on ${asset.file_name}`,
          html: `
            <h2>Piracy Attempt Detected</h2>
            <p>An unauthorized website tried to host your protected video.</p>
            <ul>
              <li><strong>Source:</strong> ${origin}</li>
              <li><strong>Asset:</strong> ${asset.file_name}</li>
              <li><strong>Asset ID:</strong> ${assetID}</li>
              <li><strong>Result:</strong> <strong style="color: red;">BLOCKED</strong></li>
              <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            </ul>
            <p>Your video's "brain" was not released. The pirate only has a useless "brick".</p>
          `
        });
      } catch (emailError) {
        console.error('Email alert failed:', emailError);
      }
    }
    
    return res.status(403).json({ 
      error: 'Forbidden: Unauthorized Domain',
      message: 'This asset can only be accessed from authorized domains'
    });
  }

  // 5. Success: Send Brain + Key
  console.log('✅ Authorized access granted');
  
  res.status(200).json({ 
    brain: asset.brain, 
    key: asset.key, 
    kid: asset.kid,
    success: true
  });
}