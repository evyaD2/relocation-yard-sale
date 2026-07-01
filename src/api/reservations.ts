/**
 * @file reservations.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 *
 * Admin-only reservation records. Buyer PII is stored here (private Supabase
 * table, RLS: authenticated-only) and NEVER in the public Google Sheet.
 */

import { supabase } from '../lib/supabase';
import type { Reservation } from '../types';

/** Columns the client is allowed to write (id/created_at are DB-managed). */
type ReservationInput = Omit<Reservation, 'id' | 'created_at' | 'updated_at'>;

/** Loads every reservation (admin dashboard). Newest-updated first. */
export async function fetchReservations(): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching reservations:', error);
    return [];
  }
  return (data ?? []) as Reservation[];
}

/**
 * Creates or updates the reservation for an item. There is at most one
 * reservation per item (enforced by a UNIQUE constraint on item_id), so this
 * upserts on that column.
 */
export async function upsertReservation(res: ReservationInput): Promise<Reservation | null> {
  const payload: ReservationInput = {
    item_id: String(res.item_id),
    item_title: res.item_title ?? null,
    sale_price: res.sale_price ?? null,
    amount: res.amount ?? null,
    pickup_date: res.pickup_date || null,
    buyer_name: res.buyer_name?.trim() || null,
    buyer_phone: res.buyer_phone?.trim() || null,
    buyer_facebook: res.buyer_facebook?.trim() || null,
    notes: res.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from('reservations')
    .upsert(payload, { onConflict: 'item_id' })
    .select()
    .single();

  if (error) {
    console.error('Error saving reservation:', error);
    return null;
  }
  return data as Reservation;
}

/** Removes the reservation for an item (e.g. the buyer backed out). */
export async function deleteReservation(itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('item_id', String(itemId));

  if (error) {
    console.error('Error deleting reservation:', error);
    return false;
  }
  return true;
}
