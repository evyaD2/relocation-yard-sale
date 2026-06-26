/**
 * @file types.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

export type ItemStatus = 'available' | 'pending' | 'sold';
export type ItemContact = 'dor' | 'neri';

export interface YardSaleItem {
  id: string;                 // Unique identifier 
  title: string;              // "Solid Wood Dining Table"
  description: string;        // Personal, warm description of the item
  price: number;              // Numeric price (in INS ₪)
  condition: string;          // "Like New", "Good", "Fair"
  category: string;           // "Furniture", "Tech", "Kitchen"
  status: ItemStatus;         // Drives visual badges and disabled buttons
  images: string[];           // Array of URLs for full visual transparency
  dimensions?: string;        // Optional real-world constraints
  fbMarketplaceLink?: string; // Optional link to Facebook Marketplace listing
  contact: ItemContact;       // Identifies which WhatsApp number to use
  display_order?: number;     // For manual reordering
  delivery_time: 'flexible' | 'departure';
}
