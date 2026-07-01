/**
 * @file types.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

export type ItemStatus = 'available' | 'pending' | 'sold';
export type ItemContact = 'evya' | 'hadas';

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
  originalPrice?: number;     // Original retail price (shown as strikethrough to highlight discount)
  brand?: string;             // Manufacturer or store name (e.g. "IKEA", "Samsung")
  model?: string;             // Model name or number (e.g. "KALLAX", "Galaxy S21")
  hidden?: boolean;           // Admin-only: hides item from public storefront
  sold_at?: string;           // ISO timestamp set when marked sold — sorts sold items newest-first
}

/**
 * A private reservation record for an item (admin-only).
 *
 * When a buyer wires a prepayment to hold an item for late-July pickup, the
 * admin marks the item as sold and records these follow-up details. Buyer PII
 * lives ONLY in the private Supabase `reservations` table — never in the public
 * Google Sheet — keyed by the Sheet item id.
 */
export interface Reservation {
  id?: string;
  item_id: string;              // Sheet item id this reservation belongs to
  item_title?: string | null;   // Snapshot of the title, for readable admin lists
  sale_price?: number | null;   // Agreed closing price, in ₪ (ILS)
  amount?: number | null;       // Prepayment received, in ₪ (ILS)
  pickup_date?: string | null;  // Agreed pickup date, YYYY-MM-DD
  buyer_name?: string | null;
  buyer_phone?: string | null;
  buyer_facebook?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}
