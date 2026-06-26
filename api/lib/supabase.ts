/**
 * @file supabase.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { createClient } from '@supabase/supabase-js';

// Note: In Vercel, non-VITE_ prefixed env vars are available in the API layer
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                           process.env.SUPABASE_SERVICE_ROLE_KEY || 
                           process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase credentials missing in API layer');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
