/**
 * @file migrate-data.cjs
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('🚀 Starting migration...');

  // 1. Load Secrets
  let secrets;
  try {
    const secretsPath = path.join(process.cwd(), 'migration_secrets.json');
    secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  } catch (err) {
    console.error('❌ Could not read migration_secrets.json. Make sure it exists and is valid JSON.');
    process.exit(1);
  }

  const {
    OLD_SUPABASE_URL,
    OLD_SUPABASE_SERVICE_ROLE_KEY,
    NEW_SUPABASE_URL,
    NEW_SUPABASE_ANON_KEY,
    NEW_SUPABASE_SERVICE_ROLE_KEY
  } = secrets;

  if (!OLD_SUPABASE_URL || !OLD_SUPABASE_SERVICE_ROLE_KEY || !NEW_SUPABASE_URL || !NEW_SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing credentials in migration_secrets.json');
    process.exit(1);
  }

  const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_ROLE_KEY);
  const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY);

  // 2. Ensure Bucket Exists
  console.log('📦 Checking storage bucket...');
  const { data: bucketData, error: bucketError } = await newSupabase.storage.getBucket('images');
  if (bucketError) {
    console.log('➕ Creating "images" bucket...');
    const { error: createError } = await newSupabase.storage.createBucket('images', { public: true });
    if (createError) {
      console.error('❌ Failed to create bucket:', createError.message);
      process.exit(1);
    }
  }

  // 3. Migrate Items
  console.log('⬇️ Fetching items from old project...');
  const { data: items, error: fetchError } = await oldSupabase
    .from('yard_sale_items')
    .select('*');

  if (fetchError) {
    console.error('❌ Failed to fetch items:', fetchError.message);
    process.exit(1);
  }

  console.log(`📦 Found ${items.length} items. Starting asset transfer...`);

  for (const item of items) {
    console.log(`🖼️ Migrating assets for: ${item.title}...`);
    const newImageUrls = [];

    for (const url of item.images || []) {
      try {
        // Extract path from URL: https://.../storage/v1/object/public/images/filename.jpg
        const parts = url.split('/images/');
        if (parts.length < 2) {
          console.warn(`⚠️ Unexpected image URL format: ${url}`);
          newImageUrls.push(url);
          continue;
        }
        const filePath = parts[1];

        // Download from old
        const { data: fileData, error: downloadError } = await oldSupabase.storage
          .from('images')
          .download(filePath);

        if (downloadError) {
          console.error(`❌ Download failed for ${filePath}:`, downloadError.message);
          continue;
        }

        // Upload to new
        const { error: uploadError } = await newSupabase.storage
          .from('images')
          .upload(filePath, fileData, { upsert: true });

        if (uploadError) {
           console.error(`❌ Upload failed for ${filePath}:`, uploadError.message);
           continue;
        }

        // Get new public URL
        const { data: publicData } = newSupabase.storage
          .from('images')
          .getPublicUrl(filePath);
        
        newImageUrls.push(publicData.publicUrl);
      } catch (e) {
        console.error(`❌ Error migrating asset: ${url}`, e);
      }
    }

    // Insert into new DB
    const { error: insertError } = await newSupabase
      .from('yard_sale_items')
      .upsert({ ...item, images: newImageUrls });

    if (insertError) {
      console.error(`❌ DB Insert failed for ${item.title}:`, insertError.message);
    } else {
      console.log(`✅ Migrated item: ${item.title}`);
    }
  }

  // 4. Migrate Analytics
  const tables = ['item_views', 'storefront_visits', 'item_shares'];
  for (const table of tables) {
    console.log(`📊 Migrating table: ${table}...`);
    const { data: rows, error: rowError } = await oldSupabase.from(table).select('*');
    if (rowError) {
      console.error(`❌ Failed to fetch ${table}:`, rowError.message);
      continue;
    }
    if (rows.length > 0) {
      const { error: batchError } = await newSupabase.from(table).upsert(rows);
      if (batchError) {
        console.error(`❌ Failed to migrate ${table}:`, batchError.message);
      } else {
        console.log(`✅ Migrated ${rows.length} rows for ${table}`);
      }
    }
  }

  console.log('🏁 Migration complete!');
}

migrate();
