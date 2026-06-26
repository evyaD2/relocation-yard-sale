/**
 * @file get_inventory.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('yard_sale_items').select('title, category, condition');
  
  if (error) {
    console.error('Error fetching items:', error);
    return;
  }
  
  console.log('Total Items:', data.length);
  console.log(JSON.stringify(data, null, 2));
}

main();
