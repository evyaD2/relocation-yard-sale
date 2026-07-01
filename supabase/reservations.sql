-- ============================================================
-- Gidony Yard Sale - Reservations
-- Run this script in the Supabase SQL Editor to add the
-- private "reservations" table used by the admin dashboard.
--
-- IMPORTANT: buyer details (name / phone / Facebook) are PII.
-- They live here (RLS: authenticated-only) and are NEVER written
-- to the public Google Sheet, which is world-readable.
-- ============================================================

CREATE TABLE IF NOT EXISTS reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The Google Sheet item id (integer string like "12"). One reservation per item.
  item_id       text NOT NULL UNIQUE,
  item_title    text,
  -- Prepayment actually received for the reservation, in ₪ (ILS).
  amount        numeric,
  -- Agreed pickup date (typically late July). Stored as a calendar date.
  pickup_date   date,
  buyer_name    text,
  buyer_phone   text,
  buyer_facebook text,
  notes         text,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS reservations_item_id_idx ON reservations(item_id);
CREATE INDEX IF NOT EXISTS reservations_pickup_date_idx ON reservations(pickup_date);

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION touch_reservation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_reservation_updated ON reservations;
CREATE TRIGGER on_reservation_updated
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION touch_reservation_updated_at();

-- RLS: only the signed-in admin may read or write. Anonymous storefront
-- visitors have NO access, so buyer PII stays private.
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read reservations" ON reservations;
CREATE POLICY "Authenticated can read reservations"
  ON reservations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert reservations" ON reservations;
CREATE POLICY "Authenticated can insert reservations"
  ON reservations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update reservations" ON reservations;
CREATE POLICY "Authenticated can update reservations"
  ON reservations FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can delete reservations" ON reservations;
CREATE POLICY "Authenticated can delete reservations"
  ON reservations FOR DELETE TO authenticated USING (true);
