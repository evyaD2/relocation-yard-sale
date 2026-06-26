-- ============================================================
-- Gidony Yard Sale - Master Database Schema
-- Run this script in the Supabase SQL Editor to initialize the project
-- ============================================================

-- 1. Clean up existing schema if running this multiple times
DROP TABLE IF EXISTS item_views CASCADE;
DROP TABLE IF EXISTS storefront_visits CASCADE;
DROP TABLE IF EXISTS item_shares CASCADE;
DROP TABLE IF EXISTS daily_digests CASCADE;
DROP TABLE IF EXISTS price_history CASCADE;
DROP TABLE IF EXISTS yard_sale_items CASCADE;
DROP TABLE IF EXISTS item_categories CASCADE;
DROP TYPE IF EXISTS item_status CASCADE;
DROP TYPE IF EXISTS contact_role CASCADE;

-- 2. Create Base Enums
CREATE TYPE item_status AS ENUM ('available', 'pending', 'sold');
CREATE TYPE contact_role AS ENUM ('dor', 'neri');

-- 3. Create Categories
CREATE TABLE item_categories (
  name text PRIMARY KEY,
  display_order int DEFAULT 0
);

ALTER TABLE item_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public categories are viewable by everyone." ON item_categories FOR SELECT USING ( true );
CREATE POLICY "Authenticated users can insert categories." ON item_categories FOR INSERT TO authenticated WITH CHECK ( true );
CREATE POLICY "Authenticated users can update categories." ON item_categories FOR UPDATE TO authenticated USING ( true );
CREATE POLICY "Authenticated users can delete categories." ON item_categories FOR DELETE TO authenticated USING ( true );

-- Seed default categories for Open Source users
INSERT INTO item_categories (name, display_order) VALUES 
('Furniture', 1), ('Electronics', 2), ('Kitchen', 3), ('Kids', 4), ('Misc', 5);

-- 4. Create Main Inventory Table
CREATE TABLE yard_sale_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  price numeric NOT NULL,
  condition text NOT NULL,
  category text NOT NULL REFERENCES item_categories(name) ON UPDATE CASCADE ON DELETE RESTRICT,
  delivery_time text NOT NULL DEFAULT 'flexible' CHECK (delivery_time IN ('flexible', 'departure')),
  status item_status DEFAULT 'available'::item_status NOT NULL,
  images text[] NOT NULL,
  dimensions text,
  "fbMarketplaceLink" text,
  contact contact_role DEFAULT 'neri'::contact_role NOT NULL,
  display_order INTEGER DEFAULT 0
);

ALTER TABLE yard_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public items are viewable by everyone." ON yard_sale_items FOR SELECT USING ( true );
CREATE POLICY "Authenticated users can insert items." ON yard_sale_items FOR INSERT TO authenticated WITH CHECK ( true );
CREATE POLICY "Authenticated users can update items." ON yard_sale_items FOR UPDATE TO authenticated USING ( true );
CREATE POLICY "Authenticated users can delete items." ON yard_sale_items FOR DELETE TO authenticated USING ( true );

-- Display Order Trigger (Newest gets top priority)
CREATE OR REPLACE FUNCTION set_new_item_display_order()
RETURNS TRIGGER AS $$
DECLARE
    v_min_order INTEGER;
BEGIN
    v_min_order := (SELECT MIN(display_order) FROM yard_sale_items);
    IF v_min_order IS NULL THEN
        NEW.display_order := 1;
    ELSE
        NEW.display_order := v_min_order - 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_item_created_reorder
    BEFORE INSERT ON yard_sale_items
    FOR EACH ROW
    EXECUTE FUNCTION set_new_item_display_order();

-- 5. Automation: Price History Log
CREATE TABLE price_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID REFERENCES yard_sale_items(id) ON DELETE CASCADE NOT NULL,
    old_price NUMERIC,
    new_price NUMERIC NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read price history" ON price_history FOR SELECT USING (true);
CREATE INDEX price_history_item_id_idx ON price_history(item_id);
CREATE INDEX price_history_changed_at_idx ON price_history(changed_at DESC);

CREATE OR REPLACE FUNCTION record_price_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.price IS NULL OR OLD.price <> NEW.price) THEN
        INSERT INTO price_history (item_id, old_price, new_price) VALUES (NEW.id, OLD.price, NEW.price);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_price_update
    AFTER UPDATE OF price OR INSERT ON yard_sale_items
    FOR EACH ROW
    EXECUTE FUNCTION record_price_change();


-- 6. Analytics: Tracking tables
CREATE TABLE item_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  viewed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  item_id uuid REFERENCES yard_sale_items(id) ON DELETE CASCADE NOT NULL,
  item_title text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('mobile', 'tablet', 'desktop')),
  referrer text NOT NULL DEFAULT 'direct'
);
CREATE INDEX item_views_item_id_idx ON item_views(item_id);
CREATE INDEX item_views_viewed_at_idx ON item_views(viewed_at DESC);
ALTER TABLE item_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon users can record item views" ON item_views FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated users can read item views" ON item_views FOR SELECT TO authenticated USING (true);

CREATE TABLE storefront_visits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  visited_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  platform text NOT NULL CHECK (platform IN ('mobile', 'tablet', 'desktop')),
  referrer text NOT NULL DEFAULT 'direct'
);
CREATE INDEX storefront_visits_visited_at_idx ON storefront_visits(visited_at DESC);
ALTER TABLE storefront_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon users can record storefront visits" ON storefront_visits FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated users can read storefront visits" ON storefront_visits FOR SELECT TO authenticated USING (true);

CREATE TABLE item_shares (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL,
  item_title text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'facebook', 'native', 'clipboard')),
  shared_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  platform text NOT NULL CHECK (platform IN ('mobile', 'tablet', 'desktop'))
);
CREATE INDEX item_shares_item_id_idx ON item_shares(item_id);
CREATE INDEX item_shares_shared_at_idx ON item_shares(shared_at DESC);
ALTER TABLE item_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon users can record item shares" ON item_shares FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated users can read item shares" ON item_shares FOR SELECT TO authenticated USING (true);

-- 7. Memory: Daily Digests Record
CREATE TABLE daily_digests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    summary TEXT NOT NULL,
    recommendations JSONB NOT NULL,
    stats_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    stats_period_end TIMESTAMP WITH TIME ZONE NOT NULL
);
ALTER TABLE daily_digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read/write daily digests" ON daily_digests FOR ALL TO authenticated USING (true);
