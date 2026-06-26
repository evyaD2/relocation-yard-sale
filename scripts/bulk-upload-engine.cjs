/**
 * @file bulk-upload-engine.cjs
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually load .env.local to avoid requiring 'dotenv'
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

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
};

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadItems(itemsToUpload) {
  for (const item of itemsToUpload) {
    console.log(`Processing: ${item.title}...`);
    
    const uploadedUrls = [];
    for (const localPhotoPath of item.localPhotos) {
      const ext = path.extname(localPhotoPath).toLowerCase();
      // Use purely random string, no original filename to avoid Hebrew character crashes
      const uniqueFileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}${ext}`;
      const fileBuffer = fs.readFileSync(localPhotoPath);
      const mimeType = getMimeType(localPhotoPath);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(uniqueFileName, fileBuffer, {
          contentType: mimeType,
          upsert: false
        });

      if (uploadError) {
        console.error(`Failed to upload ${path.basename(localPhotoPath)}:`, uploadError);
        continue;
      }
      
      const { data } = supabase.storage.from('images').getPublicUrl(uniqueFileName);
      uploadedUrls.push(data.publicUrl);
    }

    if (uploadedUrls.length === 0 && item.localPhotos.length > 0) {
      console.error(`Skipping ${item.title} because all photo uploads failed.`);
      continue;
    }

    const { data, error } = await supabase
      .from('yard_sale_items')
      .insert([{
        title: item.title,
        description: item.description,
        price: item.price,
        condition: item.condition || 'Good',
        category: item.category || 'General',
        status: 'available',
        contact: item.contact,
        images: uploadedUrls
      }]);

    if (error) {
      console.error(`Failed to insert ${item.title}:`, error);
    } else {
      console.log(`Successfully uploaded & added item: ${item.title}`);
    }
  }
  console.log("All done!");
}

module.exports = { uploadItems };
