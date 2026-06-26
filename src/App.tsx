/**
 * @file App.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { useState, useEffect } from 'react'
import { Routes, Route, useSearchParams, useNavigationType } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Hero } from './components/Hero'
import { ItemGrid } from './components/ItemGrid'
import { ItemDetails } from './components/ItemDetails'
import AdminDashboard from './pages/AdminDashboard'
import { useLanguage } from './contexts/LanguageContext'

import { fetchItems } from './api/items'
import { recordStorefrontVisit } from './api/items'
import type { YardSaleItem } from './types'
import { supabase } from './lib/supabase'

function Storefront() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const navType = useNavigationType();
  const [items, setItems] = useState<YardSaleItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Buffered item state to prevent ghosting/flicker during swipes
  const [bufferItem, setBufferItem] = useState<YardSaleItem | null>(null);

  // Determine selected item from URL
  const itemIdParam = searchParams.get('item');

  useEffect(() => {
    if (itemIdParam) {
      const item = items.find(i => i.id === itemIdParam);
      if (item) setBufferItem(item);
    }
    // We intentionally don't clear bufferItem when itemIdParam is null
    // so the modal has data to display during its closing animation/transition.
  }, [itemIdParam, items]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const data = await fetchItems();
      setItems(data);
      setLoading(false);
    }
    loadData();
  }, []);

  // Track storefront visit (only for non-admin unauthenticated users)
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && !session) recordStorefrontVisit();
    });
    return () => { cancelled = true; };
  }, []);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (itemIdParam) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; }
  }, [itemIdParam]);

  const handleSelectItem = (item: YardSaleItem) => {
    setSearchParams({ item: item.id });
  };

  const handleCloseModal = () => {
    setSearchParams({});
  };

  return (
    <>
      <Layout>
        <Hero />
        {loading ? (
          <div className="py-20 text-center text-stone font-medium animate-pulse text-lg">{t.loading}</div>
        ) : (
          <ItemGrid items={items} onSelectItem={handleSelectItem} />
        )}
      </Layout>
      
      {/* We keep the modal mounted but control its visibility via props. 
          This is the only way to ensure zero-flicker on mobile OS swipes. */}
      {bufferItem && (
        <ItemDetails 
          item={bufferItem} 
          onBack={handleCloseModal} 
          isPopNavigation={navType === 'POP'}
          isVisible={!!itemIdParam}
        />
      )}
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Storefront />} />
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  )
}

export default App
