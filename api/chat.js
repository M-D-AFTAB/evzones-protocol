// api/chat.js
import Groq from 'groq-sdk';

// Check if API key exists early
if (!process.env.GROQ_API_KEY) {
  console.error('FATAL: GROQ_API_KEY is not set in environment variables');
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages } = req.body;
  if (!messages) {
    return res.status(400).json({ error: 'Missing messages' });
  }

  try {
    console.log('GROQ_API_KEY exists?', !!process.env.GROQ_API_KEY);
    
    const completion = await groq.chat.completions.create({
      model: 'gemma2-9b-it',
      messages,
      temperature: 0.7,
      max_tokens: 512,
    });
    
    const reply = completion.choices[0].message.content;
    res.status(200).json({ reply });
  } catch (err) {
    console.error('Groq API error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}