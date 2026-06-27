/**
 * @file App.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { useState, useEffect } from 'react'
import { Routes, Route, useSearchParams, useNavigationType } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart } from 'lucide-react'
import { Layout } from './components/layout/Layout'
import { Hero } from './components/Hero'
import { ItemGrid } from './components/ItemGrid'
import { ItemDetails } from './components/ItemDetails'
import { WishlistModal } from './components/WishlistModal'
import AdminDashboard from './pages/AdminDashboard'
import { useLanguage } from './contexts/LanguageContext'
import { useWishlist } from './contexts/WishlistContext'

import { fetchItems } from './api/items'
import { recordStorefrontVisit } from './api/items'
import type { YardSaleItem } from './types'
import { supabase } from './lib/supabase'

function Storefront() {
  const { t } = useLanguage();
  const { count: wishlistCount } = useWishlist();
  const [searchParams, setSearchParams] = useSearchParams();
  const navType = useNavigationType();
  const [items, setItems] = useState<YardSaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWishlist, setShowWishlist] = useState(false);

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

  // Prevent background scrolling when any overlay is open
  useEffect(() => {
    if (itemIdParam || showWishlist) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; }
  }, [itemIdParam, showWishlist]);

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

      {/* Wishlist FAB — appears when there are liked items and no overlay is open */}
      <AnimatePresence>
        {wishlistCount > 0 && !itemIdParam && !showWishlist && (
          <motion.button
            key="wishlist-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={() => setShowWishlist(true)}
            className="fixed bottom-6 end-6 z-40 bg-[#E11D48] text-white rounded-full w-14 h-14 flex items-center justify-center shadow-xl shadow-red-500/25 hover:bg-[#C41230] active:scale-90 transition-colors"
            aria-label={t.wishlist}
          >
            <Heart size={22} fill="white" stroke="white" />
            <span className="absolute -top-1.5 -right-1.5 bg-jet text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center leading-none">
              {wishlistCount}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Wishlist Modal */}
      <AnimatePresence>
        {showWishlist && (
          <WishlistModal
            items={items}
            onSelectItem={(item) => {
              setShowWishlist(false);
              handleSelectItem(item);
            }}
            onClose={() => setShowWishlist(false)}
          />
        )}
      </AnimatePresence>

      {/* We keep the modal mounted but control its visibility via props.
          This is the only way to ensure zero-flicker on mobile OS swipes. */}
      {bufferItem && (
        <ItemDetails
          item={bufferItem}
          items={items}
          onNavigate={handleSelectItem}
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
