import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // Vercel needs these headers to allow your React app to talk to the API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { brain, key, kid, whitelist, email, fileName } = req.body;

  const { data, error } = await supabase.from('assets').insert([{
    brain, key, kid, whitelist, owner_email: email, file_name: fileName
  }]).select();

  if (error) return res.status(500).json(error);
  return res.status(200).json({ assetID: data[0].id });
}
