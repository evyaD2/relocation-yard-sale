/**
 * @file process-folders.cjs
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

const fs = require('fs');
const path = require('path');
const { uploadItems } = require('./bulk-upload-engine.cjs');

const rootDir = "L:\\.shortcut-targets-by-id\\12N0h2ypXy4GWRIM3cYJ7sjyuH3GZP7mU\\מכירת ציוד";

const TECH_KEYWORDS = ['מסך', 'מחשב', 'תנור', 'מדיח', 'מקרר', 'כביסה', 'מייבש', 'שואב', 'טוסטר אובן', 'פטיפון'];

const getFilesRecursive = (dir) => {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(getFilesRecursive(file));
    } else {
      if (['.jpg', '.jpeg', '.png', '.heic', '.webp'].includes(path.extname(file).toLowerCase())) {
        results.push(file);
      }
    }
  });
  return results;
};

const main = async () => {
  const folders = fs.readdirSync(rootDir).filter(f => fs.statSync(path.join(rootDir, f)).isDirectory());
  
  const itemsToUpload = [];

  for (const folderName of folders) {
    if (folderName.startsWith('X-')) {
      console.log(`Skipping: ${folderName}`);
      continue; // skip X- items
    }

    const folderPath = path.join(rootDir, folderName);
    const localPhotos = getFilesRecursive(folderPath);

    if (localPhotos.length === 0) {
      console.log(`Skipping (No photos): ${folderName}`);
      continue;
    }

    const parts = folderName.split('-').map(p => p.trim());
    let title = parts[0];
    let priceMatch = folderName.match(/(?:-\s*)([0-9]+(?:\.[0-9]+)?)[^\d]*$/);
    let price = priceMatch ? Number(priceMatch[1]) : 0;
    
    // Extract condition if more than two parts
    let conditionStr = "";
    if (parts.length >= 3) {
      conditionStr = `\nמצב / הערות: ${parts.slice(1, parts.length - 1).join(', ')}`;
    } else if (parts.length === 2 && !priceMatch) {
       // Just two words and no price?
       title = folderName;
    }

    let contact = 'neri'; // assume non tech
    for (const kw of TECH_KEYWORDS) {
      if (title.includes(kw)) {
        contact = 'dor';
        break;
      }
    }

    const description = `פריט מעולה ושמור למכירה מבית משפחת גדעוני, נמכר עקב רילוקיישן.${conditionStr}`;
    const category = contact === 'dor' ? 'Electronics / Appliances' : 'Furniture & Home';

    itemsToUpload.push({
      title,
      description,
      price,
      condition: parts.length >= 3 ? parts[1] : 'במצב מעולה',
      category,
      contact,
      localPhotos
    });
  }

  console.log(`Prepared ${itemsToUpload.length} items for upload. Attempting upload...`);
  await uploadItems(itemsToUpload);
  console.log("Bulk upload process completed!");
};

main().catch(console.error);
