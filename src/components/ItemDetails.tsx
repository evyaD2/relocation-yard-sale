import { useCallback, useEffect, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { generateWhatsAppLink } from '../utils/whatsapp';
import type { YardSaleItem } from '../types';
import { Share2, X, ArrowUpRight, ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { motion } from 'framer-motion';
import { track } from '@vercel/analytics';
import { supabase } from '../lib/supabase';
import { recordItemView, recordItemShare } from '../api/items';
import type { ShareChannel } from '../api/items';
import { useLanguage } from '../contexts/LanguageContext';

interface ItemDetailsProps {
  item: YardSaleItem;
  onBack: () => void;
  isPopNavigation?: boolean;
  isVisible: boolean;
}

const scrollCache = new Map<string, number>();

export function ItemDetails({ item, onBack, isPopNavigation = false, isVisible }: ItemDetailsProps) {
  const { t } = useLanguage();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
      if (e.key === 'Escape' && isVisible) onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, isVisible]);

  const scrollPrev = useCallback(() => { if (emblaApi) emblaApi.scrollPrev(); }, [emblaApi]);
  const scrollNext = useCallback(() => { if (emblaApi) emblaApi.scrollNext(); }, [emblaApi]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url: window.location.href });
        trackShare('native');
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert(t.linkCopied);
        trackShare('clipboard');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const trackShare = (channel: ShareChannel) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) recordItemShare(item.id, item.title, channel);
    });
  };

  const isSold = item.status === 'sold';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

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
                {item.images.map((img, idx) => (
                  <div
                    className="relative flex-[0_0_100%] h-full w-full min-w-0 flex items-center justify-center p-2 sm:p-6"
                    key={idx}
                  >
                    <img
                      src={img}
                      alt={`${item.title} - ${idx + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>

            {item.images.length > 1 && (
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
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                  {item.images.map((_, idx) => (
                    <div key={idx} className="w-1.5 h-1.5 bg-surface rounded-full shadow-sm opacity-90" />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-10 max-w-4xl mx-auto w-full mt-2">
          {/* Status + Price row */}
          <div className="flex items-center justify-between mb-4" dir="ltr">
            <p className="font-black text-3xl sm:text-5xl text-jet tracking-tight">
              ₪{item.price.toLocaleString()}
            </p>
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
                <p className="text-jet font-bold text-lg sm:text-xl">{item.condition}</p>
              </div>
              <div className="text-right">
                <h3 className="text-xs font-bold text-stone uppercase tracking-widest mb-2">
                  {t.deliveryLabel}
                </h3>
                <p className="text-jet font-bold text-lg sm:text-xl">
                  {item.delivery_time === 'departure' ? t.deliveryDeparture : t.deliveryFlexible}
                </p>
              </div>
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
      <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-oatmeal via-oatmeal to-transparent pointer-events-none z-10">
        <div className="max-w-xl mx-auto w-full pointer-events-auto flex flex-col sm:flex-row justify-center gap-3">
          <a
            href={generateWhatsAppLink(item.title, item.price, item.contact)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackShare('whatsapp')}
            className={`w-full sm:max-w-xs py-4 px-6 font-bold text-base text-center flex items-center justify-center gap-3 transition-all outline-none rounded-2xl shadow-lg active:scale-95 ${
              isSold
                ? 'bg-surface text-stone pointer-events-none shadow-none border border-border-subtle'
                : 'bg-[#FF9900] text-jet hover:bg-[#E68A00] shadow-[#FF9900]/30 font-black'
            }`}
          >
            <span>{t.ctaWhatsapp}</span>
            <ArrowUpRight size={20} strokeWidth={2.5} />
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
  );
}
