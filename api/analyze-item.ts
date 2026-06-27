/**
 * @file analyze-item.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 *
 * POST /api/analyze-item
 * Server-side proxy for the admin "AI Fill" feature. Keeps the Gemini API key
 * on the server (process.env.GEMINI_API_KEY) instead of shipping it in the
 * public client bundle. Requires a valid Supabase admin session.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './lib/supabase.js';

interface ImagePart {
  data: string;      // base64 (no data: prefix)
  mimeType: string;  // e.g. "image/jpeg"
}

const PROMPT = `Analyze these product photos for a yard sale listing. Return ONLY a JSON object (no markdown) with:
{
  "title": "concise product title in English (max 60 chars)",
  "description": "warm 2-3 sentence description mentioning condition and key features",
  "condition": "one of exactly: excellent, like_new, good, fair, used",
  "category": "one of exactly: furniture, appliance, other",
  "brand": "brand or manufacturer name if visible, else empty string",
  "model": "model name or number if visible, else empty string",
  "originalPrice": estimated original retail price as integer (0 if unknown)
}`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Auth — only logged-in admins may spend AI credits.
  const authHeader = req.headers['authorization'] as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  // 2. Config check.
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('GEMINI_API_KEY is not configured.');
    return res.status(500).json({ error: 'AI not configured' });
  }

  // 3. Validate input.
  const images: ImagePart[] = Array.isArray(req.body?.images) ? req.body.images : [];
  const valid = images
    .filter(i => i && typeof i.data === 'string' && typeof i.mimeType === 'string')
    .slice(0, 3); // cap to bound request cost / size
  if (valid.length === 0) {
    return res.status(400).json({ error: 'No images provided' });
  }

  // 4. Call Gemini.
  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      ...valid.map(i => ({ inlineData: { data: i.data, mimeType: i.mimeType } })),
      PROMPT,
    ]);

    const text = result.response.text().trim();
    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }

    if (!parsed) return res.status(502).json({ error: 'Could not parse AI response' });
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('AI analysis failed:', err);
    return res.status(500).json({ error: 'AI analysis failed' });
  }
}
