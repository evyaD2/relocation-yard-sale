/**
 * @file verify-migration.cjs
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function verify() {
  const secretsPath = path.join(process.cwd(), 'migration_secrets.json');
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));

  const newClient = createClient(secrets.NEW_SUPABASE_URL, secrets.NEW_SUPABASE_SERVICE_ROLE_KEY);

  const { count: itemsCount } = await newClient.from('yard_sale_items').select('*', { count: 'exact', head: true });
  const { count: viewsCount } = await newClient.from('item_views').select('*', { count: 'exact', head: true });
  const { count: visitsCount } = await newClient.from('storefront_visits').select('*', { count: 'exact', head: true });

  console.log('--- Migration Verification ---');
  console.log(`Items: ${itemsCount}`);
  console.log(`Views: ${viewsCount}`);
  console.log(`Visits: ${visitsCount}`);
}

verify();
