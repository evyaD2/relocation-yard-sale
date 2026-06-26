/**
 * @file generate-seed.js
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

const fs = require('fs');
const items = require('./src/data/inventory.json');

let sql = "INSERT INTO yard_sale_items (id, title, description, price, condition, category, status, images, dimensions, \"fbMarketplaceLink\", contact) VALUES\n";

const values = items.map(item => {
  // Convert images array to Postgres array string: '{"url1", "url2"}'
  const imagesPg = `'{${item.images.map(img => `"${img}"`).join(',')}}'`;
  
  // Escape single quotes in strings
  const escapeString = (str) => {
    if (!str) return 'NULL';
    return `'${str.replace(/'/g, "''")}'`;
  };

  const id = item.id.replace('itm-', '00000000-0000-0000-0000-000000000') + '00'; // Make fake UUIDs or just let postgres gen them? 
  // Wait, the schema uses UUID for id. If I provide a string it must be a valid UUID.
  // Instead of providing id, I can let postgres generate gen_random_uuid(). 
  // So I won't specify "id" in the insert column list.
  return `(${escapeString(item.title)}, ${escapeString(item.description)}, ${item.price}, ${escapeString(item.condition)}, ${escapeString(item.category)}, '${item.status || 'available'}', ARRAY[${item.images.map(img=>escapeString(img)).join(', ')}], ${escapeString(item.dimensions)}, ${escapeString(item.fbMarketplaceLink)}, 'neri')`;
});

sql = `INSERT INTO yard_sale_items (title, description, price, condition, category, status, images, dimensions, "fbMarketplaceLink", contact) VALUES\n` + values.join(",\n") + ";\n";

fs.writeFileSync('./supabase/seed.sql', sql);
console.log("Successfully generated seed.sql");
