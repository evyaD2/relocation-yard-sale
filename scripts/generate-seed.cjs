/**
 * @file generate-seed.cjs
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

const fs = require('fs');
const items = require('./src/data/inventory.json');

let sql = "INSERT INTO yard_sale_items (title, description, price, condition, category, status, images, dimensions, \"fbMarketplaceLink\", contact) VALUES\n";

const values = items.map(item => {
  // Escape single quotes in strings
  const escapeString = (str) => {
    if (!str) return 'NULL';
    return `'${str.replace(/'/g, "''")}'`;
  };

  return `(${escapeString(item.title)}, ${escapeString(item.description)}, ${item.price}, ${escapeString(item.condition)}, ${escapeString(item.category)}, '${item.status || 'available'}', ARRAY[${item.images.map(img=>escapeString(img)).join(', ')}], ${escapeString(item.dimensions)}, ${escapeString(item.fbMarketplaceLink)}, 'neri')`;
});

sql = `INSERT INTO yard_sale_items (title, description, price, condition, category, status, images, dimensions, "fbMarketplaceLink", contact) VALUES\n` + values.join(",\n") + ";\n";

fs.writeFileSync('./supabase/seed.sql', sql);
console.log("Successfully generated seed.sql");
