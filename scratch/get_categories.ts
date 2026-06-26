/**
 * @file get_categories.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function main() {
  const { data, error } = await supabase.from('yard_sale_items').select('category');
  if (error) {
    console.error(error);
    return;
  }
  const categories = data.map(d => d.category);
  const uniqueCategories = [...new Set(categories)];
  console.log('Unique categories:', uniqueCategories);
}
main();
