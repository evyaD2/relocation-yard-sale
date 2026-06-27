/**
 * @file supabase.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { createClient } from '@supabase/supabase-js';

// Note: In Vercel, non-VITE_ prefixed env vars are available in the API layer.
// IMPORTANT: never read a VITE_-prefixed service-role key here — anything with the
// VITE_ prefix is bundled into the public client and exposed to every visitor.
// Set a plain (server-only) SUPABASE_SERVICE_ROLE_KEY in your Vercel env vars.
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY || ''; // anon fallback: relies on RLS

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase credentials missing in API layer');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
