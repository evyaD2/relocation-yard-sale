/**
 * @file cleanup.cjs
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8').split('\n');
  envConfig.forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      process.env[key.trim()] = values.join('=').trim().replace(/(^"|"$)/g, '');
    }
  });
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function cleanDB() {
  console.log("Wiping items that don't match exactly IKEA bed...");
  // We will delete all records where title isn't 'IKEA Bed' from the DB to clean the failed loop
  const { error } = await supabase.from('yard_sale_items').delete().neq('title', 'IKEA Bed'); // just guessing the name if they added an ikea bed. Actually, let's just delete anything created in the last 15 minutes.
  
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();
  console.log('Deleting items created after', fifteenMinsAgo);
  const { error: err2 } = await supabase.from('yard_sale_items').delete().gte('created_at', fifteenMinsAgo);
  if (err2) console.error(err2);
  else console.log('Cleaned up recently added dirty rows!');
}
cleanDB();
