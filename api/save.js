import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { brain, key, kid, whitelist, email, fileName } = req.body;

  // CRITICAL FIX: Store brain as TEXT (Base64 string), not BYTEA
  // The brain coming from the client is already a clean Base64 string
  const { data, error } = await supabase.from('assets').insert([{
    brain: brain, // Store as-is (Base64 text)
    key, 
    kid, 
    whitelist, 
    owner_email: email, 
    file_name: fileName
  }]).select();

  if (error) {
    console.error('Supabase insert error:', error);
    return res.status(500).json(error);
  }
  
  return res.status(200).json({ assetID: data[0].id });
}