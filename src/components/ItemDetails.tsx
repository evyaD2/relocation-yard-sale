import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { generateWhatsAppLink } from '../utils/whatsapp';
import type { YardSaleItem } from '../types';
import { Share2, X, ChevronLeft, ChevronRight, Store, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { track } from '@vercel/analytics';
import { supabase } from '../lib/supabase';
import { recordItemView, recordItemShare } from '../api/items';
import type { ShareChannel } from '../api/items';
import { useLanguage, CONDITION_LABELS } from '../contexts/LanguageContext';
import { useWishlist } from '../contexts/WishlistContext';
import { ShareMenu } from './ShareMenu';
import { IMAGE_PLACEHOLDER, handleImageError } from '../utils/imageFallback';

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 shrink-0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

interface ItemDetailsProps {
  item: YardSaleItem;
  /** Ordered list the detail view can page through. */
  items?: YardSaleItem[];
  /** Navigate the detail view to another item without closing it. */
  onNavigate?: (item: YardSaleItem) => void;
  onBack: () => void;
  isPopNavigation?: boolean;
  isVisible: boolean;
}

const scrollCache = new Map<string, number>();

export function ItemDetails({ item, items = [], onNavigate, onBack, isPopNavigation = false, isVisible }: ItemDetailsProps) {
  const { t, lang } = useLanguage();

  // Sibling items for in-place paging (prev/next without leaving the view).
  const { prevItem, nextItem, position } = useMemo(() => {
    const idx = items.findIndex(i => i.id === item.id);
    if (idx === -1) return { prevItem: null, nextItem: null, position: null };
    return {
      prevItem: idx > 0 ? items[idx - 1] : null,
      nextItem: idx < items.length - 1 ? items[idx + 1] : null,
      position: { current: idx + 1, total: items.length },
    };
  }, [items, item.id]);

  const goPrev = useCallback(() => { if (prevItem) onNavigate?.(prevItem); }, [prevItem, onNavigate]);
  const goNext = useCallback(() => { if (nextItem) onNavigate?.(nextItem); }, [nextItem, onNavigate]);

  const { isLiked, toggle: toggleWishlist } = useWishlist();
  const liked = isLiked(item.id);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Drop images that fail to load so we never show a broken slide; only fall
  // back to the placeholder when the item has no loadable images at all.
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  useEffect(() => { setFailedImages(new Set()); }, [item.id]);
  const handleImageFail = useCallback((src: string) => {
    setFailedImages(prev => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);
  const validImages = useMemo(
    () => item.images.filter(img => img && !failedImages.has(img)),
    [item.images, failedImages],
  );
  const displayImages = validImages.length > 0 ? validImages : [IMAGE_PLACEHOLDER];

  // Track active slide index for dot indicators
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  // Reset carousel when item changes
  useEffect(() => {
    setSelectedIndex(0);
    emblaApi?.scrollTo(0, true);
  }, [item.id, emblaApi]);

  // Re-init when the number of slides changes (e.g. a broken image was dropped)
  useEffect(() => {
    emblaApi?.reInit();
    setSelectedIndex(emblaApi?.selectedScrollSnap() ?? 0);
  }, [emblaApi, displayImages.length]);

  useEffect(() => {
    if (isVisible && scrollContainerRef.current) {
      const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          const savedScroll = scrollCache.get(item.id) || 0;
          scrollContainerRef.current.scrollTop = savedScroll;
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [item.id, isVisible]);

  const handleScroll = () => {
    if (scrollContainerRef.current && isVisible) {
      scrollCache.set(item.id, scrollContainerRef.current.scrollTop);
    }
  };

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || session || !isVisible) return;
      track('Item View', {
        itemId: item.id,
        itemTitle: item.title,
        itemPrice: item.price,
        platform: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      });
      recordItemView(item.id, item.title);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, isVisible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible) return;
      if (e.key === 'Escape') onBack();
      // Page between items with arrow keys (left = prev, right = next).
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, isVisible, goPrev, goNext]);

  const scrollPrev = useCallback(() => { if (emblaApi) emblaApi.scrollPrev(); }, [emblaApi]);
  const scrollNext = useCallback(() => { if (emblaApi) emblaApi.scrollNext(); }, [emblaApi]);

  const handleShare = async () => {
    const shareData = { title: item.title, url: window.location.href };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        trackShare('native');
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    setShowShareMenu(true);
  };

  const trackShare = (channel: ShareChannel) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) recordItemShare(item.id, item.title, channel);
    });
  };

  const isSold = item.status === 'sold';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Condition translation
  const conditionDisplay =
    CONDITION_LABELS[item.condition?.toLowerCase()]?.[lang] ?? item.condition;

  const variants = {
    visible: {
      opacity: 1,
      y: 0,
      pointerEvents: 'auto' as const,
      display: 'flex',
    },
    hidden: {
      opacity: isPopNavigation ? 1 : 0,
      y: (isPopNavigation || isMobile) ? 0 : '100%',
      pointerEvents: 'none' as const,
      transitionEnd: { display: 'none' },
    },
  };

  return (
    <>
      <motion.div
        initial={false}
        animate={isVisible ? 'visible' : 'hidden'}
        variants={variants}
        transition={{
          type: 'spring',
          stiffness: 350,
          damping: 35,
          duration: isPopNavigation ? 0 : (isMobile ? 0.25 : 0.4),
        }}
        className="fixed inset-0 z-50 bg-oatmeal flex flex-col overflow-hidden [will-change:transform,opacity]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 sticky top-0 z-20 shrink-0 bg-oatmeal md:bg-oatmeal/90 md:backdrop-blur-md border-b border-border-subtle">
          <button
            onClick={onBack}
            className="p-2.5 bg-surface border border-border-subtle rounded-xl hover:bg-oatmeal text-jet transition-colors outline-none cursor-pointer shadow-sm"
          >
            <X size={20} strokeWidth={2.5} />
          </button>

          {/* Page between items without leaving the view */}
          {position && position.total > 1 && (
            <div className="flex items-center gap-1.5 sm:gap-2" dir="ltr">
              <button
                onClick={goPrev}
                disabled={!prevItem}
                aria-label="Previous item"
                className="p-2.5 bg-surface border border-border-subtle rounded-xl text-jet transition-colors outline-none shadow-sm enabled:hover:bg-oatmeal enabled:cursor-pointer disabled:opacity-35"
              >
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
              <span className="text-stone text-xs sm:text-sm font-bold tabular-nums min-w-[3.5rem] text-center select-none">
                {position.current} / {position.total}
              </span>
              <button
                onClick={goNext}
                disabled={!nextItem}
                aria-label="Next item"
                className="p-2.5 bg-surface border border-border-subtle rounded-xl text-jet transition-colors outline-none shadow-sm enabled:hover:bg-oatmeal enabled:cursor-pointer disabled:opacity-35"
              >
                <ChevronRight size={20} strokeWidth={2.5} />
              </button>
            </div>
          )}

          <button
            onClick={handleShare}
            className="p-2.5 bg-surface border border-border-subtle rounded-xl hover:bg-oatmeal text-jet transition-colors outline-none cursor-pointer shadow-sm"
          >
            <Share2 size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div
          key={item.id}
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto no-scrollbar pb-48 pt-4 sm:pt-8"
        >
          {/* Image carousel */}
          <div className="relative max-w-5xl mx-auto w-full px-4 sm:px-8 group" dir="ltr">
            <div className="relative aspect-square sm:aspect-[4/3] md:aspect-[16/9] rounded-2xl overflow-hidden bg-surface border border-border-subtle shadow-sm">
              <div className="h-full w-full touch-pan-y" ref={emblaRef}>
                <div className="flex h-full w-full">
                  {displayImages.map((img, idx) => (
                    <div
                      className="relative flex-[0_0_100%] h-full w-full min-w-0 flex items-center justify-center p-2 sm:p-6"
                      key={img}
                    >
                      <img
                        src={img}
                        alt={`${item.title} - ${idx + 1}`}
                        onError={img === IMAGE_PLACEHOLDER ? handleImageError : () => handleImageFail(img)}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Wishlist heart — available items only */}
              {!isSold && (
                <button
                  onClick={() => toggleWishlist(item.id)}
                  className="absolute top-3 right-3 z-20 p-2 bg-white/85 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-all active:scale-90 outline-none"
                  aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart
                    size={18}
                    fill={liked ? '#E11D48' : 'none'}
                    stroke={liked ? '#E11D48' : '#6E6E73'}
                    strokeWidth={2}
                  />
                </button>
              )}

              {displayImages.length > 1 && (
                <>
                  <button
                    aria-label="Previous image"
                    onClick={scrollPrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 bg-surface/90 hover:bg-surface border border-border-subtle rounded-xl shadow-sm transition-all sm:opacity-0 group-hover:opacity-100 z-10 cursor-pointer outline-none"
                  >
                    <ChevronLeft size={24} strokeWidth={2.5} className="text-jet" />
                  </button>
                  <button
                    aria-label="Next image"
                    onClick={scrollNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 bg-surface/90 hover:bg-surface border border-border-subtle rounded-xl shadow-sm transition-all sm:opacity-0 group-hover:opacity-100 z-10 cursor-pointer outline-none"
                  >
                    <ChevronRight size={24} strokeWidth={2.5} className="text-jet" />
                  </button>

                  {/* Interactive dots */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-1.5 z-10">
                    {displayImages.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => emblaApi?.scrollTo(idx)}
                        className={`rounded-full transition-all duration-300 ${
                          idx === selectedIndex
                            ? 'w-5 h-2 bg-white opacity-100 shadow-sm'
                            : 'w-2 h-2 bg-white/55 hover:bg-white/80'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 sm:p-10 max-w-4xl mx-auto w-full mt-2">
            {/* Status + Price row */}
            <div className="flex items-end justify-between mb-4" dir="ltr">
              <div className="flex flex-col gap-1">
                {item.originalPrice && item.originalPrice > item.price && (
                  <div className="flex items-center gap-2">
                    <p className="text-stone text-lg sm:text-2xl line-through">
                      ₪{item.originalPrice.toLocaleString()}
                    </p>
                    <span className="px-2 py-0.5 text-[11px] font-bold tracking-wide rounded-full bg-amber-100 text-amber-700">
                      -{Math.round((item.originalPrice - item.price) / item.originalPrice * 100)}%
                    </span>
                  </div>
                )}
                <p className="font-black text-3xl sm:text-5xl text-jet tracking-tight">
                  ₪{item.price.toLocaleString()}
                </p>
              </div>
              <span
                className={`px-3 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-full ${
                  isSold ? 'bg-[#DC2626]/10 text-[#DC2626]' : 'bg-[#16A34A]/10 text-[#16A34A]'
                }`}
              >
                {isSold ? t.sold : t.available}
              </span>
            </div>

            <h1
              className="text-3xl sm:text-5xl font-bold text-jet leading-tight mb-8"
              dir="auto"
            >
              {item.title}
            </h1>

            <div className="w-full h-px bg-border-subtle mb-8" />

            <div className="space-y-10 flex flex-col items-start w-full" dir="auto">
              {/* Description */}
              <div className="w-full" dir="auto">
                <h3 className="text-xs font-bold text-stone uppercase tracking-widest mb-4">
                  {t.descriptionLabel}
                </h3>
                <p className="text-jet leading-relaxed whitespace-pre-wrap text-lg sm:text-xl font-medium">
                  {item.description}
                </p>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-6 w-full rounded-2xl border border-border-subtle py-8 px-6 sm:px-8 bg-surface shadow-sm" dir="rtl">
                <div className="text-right">
                  <h3 className="text-xs font-bold text-stone uppercase tracking-widest mb-2">
                    {t.conditionLabel}
                  </h3>
                  <p className="text-jet font-bold text-lg sm:text-xl">{conditionDisplay}</p>
                </div>
                <div className="text-right">
                  <h3 className="text-xs font-bold text-stone uppercase tracking-widest mb-2">
                    {t.deliveryLabel}
                  </h3>
                  <p className="text-jet font-bold text-lg sm:text-xl">
                    {item.delivery_time === 'departure' ? t.deliveryDeparture : t.deliveryFlexible}
                  </p>
                </div>
                {item.brand && (
                  <div className="text-right">
                    <h3 className="text-xs font-bold text-stone uppercase tracking-widest mb-2">
                      {t.brandLabel}
                    </h3>
                    <p className="text-jet font-bold text-lg sm:text-xl">{item.brand}</p>
                  </div>
                )}
                {item.model && (
                  <div className="text-right">
                    <h3 className="text-xs font-bold text-stone uppercase tracking-widest mb-2">
                      {t.modelLabel}
                    </h3>
                    <p className="text-jet font-bold text-lg sm:text-xl">{item.model}</p>
                  </div>
                )}
                {item.dimensions && (
                  <div className="text-right col-span-2">
                    <h3 className="text-xs font-bold text-stone uppercase tracking-widest mb-2">
                      {t.dimensionsLabel}
                    </h3>
                    <p className="text-jet font-bold text-lg sm:text-xl" dir="ltr">
                      {item.dimensions}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky CTA */}
        <div
          className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-oatmeal via-oatmeal to-transparent pointer-events-none z-10"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-xl mx-auto w-full pointer-events-auto flex flex-col sm:flex-row justify-center gap-3">
            <a
              href={generateWhatsAppLink(item.title, item.price, item.contact)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackShare('whatsapp')}
              className={`w-full sm:max-w-xs py-4 px-6 font-bold text-base text-center flex items-center justify-center gap-3 transition-all outline-none rounded-2xl shadow-lg active:scale-95 ${
                isSold
                  ? 'bg-surface text-stone pointer-events-none shadow-none border border-border-subtle'
                  : 'bg-[#25D366] text-white hover:bg-[#1DA851] shadow-green-500/20 font-black'
              }`}
            >
              {!isSold && <WhatsAppIcon />}
              <span>{t.ctaWhatsapp}</span>
            </a>

            {item.fbMarketplaceLink && (
              <a
                href={item.fbMarketplaceLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackShare('facebook')}
                className={`w-full sm:max-w-xs py-4 px-6 font-bold text-base text-center flex items-center justify-center gap-3 transition-all outline-none rounded-2xl shadow-lg active:scale-95 ${
                  isSold
                    ? 'bg-surface/50 text-stone pointer-events-none shadow-none'
                    : 'bg-[#1877F2] text-white hover:bg-[#0C63D4]'
                }`}
              >
                <Store size={20} strokeWidth={2.5} />
                <span>{t.ctaMarketplace}</span>
              </a>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showShareMenu && (
          <ShareMenu
            url={window.location.href}
            title={item.title}
            onClose={() => setShowShareMenu(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
