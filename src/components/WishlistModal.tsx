import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, Share2 } from 'lucide-react';
import { useWishlist } from '../contexts/WishlistContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ShareMenu } from './ShareMenu';
import { CONTACT_NUMBERS } from '../config/contacts';
import { IMAGE_PLACEHOLDER, handleImageError } from '../utils/imageFallback';
import type { YardSaleItem } from '../types';

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 shrink-0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

interface WishlistModalProps {
  items: YardSaleItem[];
  onSelectItem: (item: YardSaleItem) => void;
  onClose: () => void;
}

export function WishlistModal({ items, onSelectItem, onClose }: WishlistModalProps) {
  const { wishlist, toggle, isLiked } = useWishlist();
  const { t, lang } = useLanguage();
  const [showShare, setShowShare] = useState(false);

  const likedItems = items.filter(item => wishlist.includes(item.id));

  const handleWhatsApp = () => {
    const phone = CONTACT_NUMBERS.evya;
    const header =
      lang === 'he'
        ? 'היי! 🏡 אני מעוניין/ת בפריטים הבאים ממכירת החצר של משפחת אדרי:\n\n'
        : "Hi! 🏡 I'm interested in the following items from the Edry family yard sale:\n\n";
    const list = likedItems
      .map(item => `• ${item.title} — ₪${item.price.toLocaleString()}`)
      .join('\n');
    const footer =
      lang === 'he'
        ? '\n\nהאם הפריטים עדיין זמינים? 😊'
        : '\n\nAre these items still available? 😊';
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(header + list + footer)}`,
      '_blank',
    );
  };

  const handleShare = async () => {
    const text =
      lang === 'he'
        ? `הרשימה שלי ממכירת החצר של משפחת אדרי:\n${likedItems.map(i => `• ${i.title} ₪${i.price}`).join('\n')}`
        : `My wishlist from the Edry family yard sale:\n${likedItems.map(i => `• ${i.title} ₪${i.price}`).join('\n')}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t.wishlist, text, url: window.location.href });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    setShowShare(true);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', stiffness: 350, damping: 35 }}
        className="fixed inset-0 z-50 bg-oatmeal flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border-subtle bg-oatmeal shrink-0">
          <button
            onClick={onClose}
            className="p-2.5 bg-surface border border-border-subtle rounded-xl hover:bg-oatmeal text-jet transition-colors shadow-sm"
          >
            <X size={20} strokeWidth={2.5} />
          </button>

          <div className="flex items-center gap-2">
            <Heart size={18} fill="#E11D48" stroke="#E11D48" />
            <h2 className="font-bold text-jet text-lg">{t.wishlist}</h2>
            {likedItems.length > 0 && (
              <span className="bg-[#E11D48] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {likedItems.length}
              </span>
            )}
          </div>

          <button
            onClick={handleShare}
            disabled={likedItems.length === 0}
            className="p-2.5 bg-surface border border-border-subtle rounded-xl hover:bg-oatmeal text-jet transition-colors shadow-sm disabled:opacity-30"
          >
            <Share2 size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 pb-36">
          {likedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-24 gap-4">
              <Heart size={52} className="text-border-subtle" strokeWidth={1.5} />
              <p className="font-bold text-jet text-xl">{t.wishlistEmpty}</p>
              <p className="text-stone text-sm text-center max-w-xs">{t.wishlistEmptyHint}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 max-w-3xl mx-auto">
              {likedItems.map(item => (
                <div
                  key={item.id}
                  className="relative bg-surface rounded-2xl overflow-hidden shadow-sm border border-border-subtle group cursor-pointer hover:shadow-lg transition-all"
                  onClick={() => onSelectItem(item)}
                >
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={item.images[0] || IMAGE_PLACEHOLDER}
                      alt={item.title}
                      onError={handleImageError}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {/* Remove from wishlist */}
                    <button
                      onClick={e => { e.stopPropagation(); toggle(item.id); }}
                      className="absolute top-2 end-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-colors"
                    >
                      <Heart
                        size={16}
                        fill={isLiked(item.id) ? '#E11D48' : 'none'}
                        stroke={isLiked(item.id) ? '#E11D48' : '#6E6E73'}
                      />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-jet text-sm leading-snug line-clamp-2 mb-1" dir="auto">
                      {item.title}
                    </p>
                    <p className="font-black text-base text-jet" dir="ltr">
                      ₪{item.price.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky WhatsApp CTA */}
        {likedItems.length > 0 && (
          <div
            className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-oatmeal via-oatmeal to-transparent pointer-events-none z-10"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="max-w-md mx-auto pointer-events-auto">
              <button
                onClick={handleWhatsApp}
                className="w-full py-4 px-6 font-bold text-base text-jet flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1DA851] rounded-2xl shadow-lg shadow-green-500/20 active:scale-95 transition-all"
              >
                <WhatsAppIcon />
                {t.inquireAll}
              </button>
            </div>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showShare && (
          <ShareMenu
            url={window.location.href}
            title={t.wishlist}
            text={likedItems.map(i => `• ${i.title} ₪${i.price}`).join('\n')}
            onClose={() => setShowShare(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
