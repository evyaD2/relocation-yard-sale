/**
 * @file ItemDetails.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

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

interface ItemDetailsProps {
  item: YardSaleItem;
  onBack: () => void;
  isPopNavigation?: boolean;
  isVisible: boolean;
}

// Simple global scroll memory
const scrollCache = new Map<string, number>();

export function ItemDetails({ item, onBack, isPopNavigation = false, isVisible }: ItemDetailsProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync scroll on item change or visibility toggle
  useEffect(() => {
    if (isVisible && scrollContainerRef.current) {
      // Small timeout to ensure the DOM with the new KEY has settled
      const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          const savedScroll = scrollCache.get(item.id) || 0;
          scrollContainerRef.current.scrollTop = savedScroll;
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [item.id, isVisible]);

  // Save scroll position whenever the user scrolls
  const handleScroll = () => {
    if (scrollContainerRef.current && isVisible) {
      scrollCache.set(item.id, scrollContainerRef.current.scrollTop);
    }
  };

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || session || !isVisible) return;
      // Vercel Analytics custom event
      track('Item View', {
        itemId: item.id,
        itemTitle: item.title,
        itemPrice: item.price,
        platform: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      });
      // Supabase-backed event
      recordItemView(item.id, item.title);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, isVisible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, isVisible]);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: item.title,
          url: window.location.href,
        });
        trackShare('native');
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
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

  const statusLabels = {
    available: 'זמין',
    pending: 'זמין',
    sold: 'נמכר',
  };

  // Determine if we should use mobile (fade) or desktop (slide) variants
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Variants now control opacity and visibility directly
  const variants = {
    visible: { 
      opacity: 1, 
      y: 0,
      pointerEvents: "auto" as const,
      display: "flex"
    },
    hidden: { 
      // During POP navigation, we snap to hidden instantly
      opacity: isPopNavigation ? 1 : 0, 
      y: (isPopNavigation || isMobile) ? 0 : "100%",
      pointerEvents: "none" as const,
      transitionEnd: {
        display: "none"
      }
    }
  };

  return (
    <motion.div 
      initial={false}
      animate={isVisible ? "visible" : "hidden"}
      variants={variants}
      transition={{ 
        type: "spring", 
        stiffness: 350, 
        damping: 35,
        duration: isPopNavigation ? 0 : (isMobile ? 0.25 : 0.4) 
      }}
      className="fixed inset-0 z-50 bg-oatmeal flex flex-col overflow-hidden [will-change:transform,opacity]" 
    >
      {/* Super Minimal Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 sticky top-0 z-20 shrink-0 bg-oatmeal md:bg-oatmeal/90 md:backdrop-blur-md border-b-[2px] border-jet">
        <button onClick={onBack} className="p-3 bg-surface border-[2px] border-jet rounded-none hover:bg-jet hover:text-surface text-jet transition-colors outline-none cursor-pointer">
          <X size={20} strokeWidth={2.5} />
        </button>
        <button onClick={handleShare} className="p-3 bg-surface border-[2px] border-jet rounded-none hover:bg-jet hover:text-surface text-jet transition-colors outline-none cursor-pointer">
          <Share2 size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div 
        key={item.id}
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar pb-48 pt-4 sm:pt-10"
      >
        {/* Carousel */}
        <div className="relative max-w-5xl mx-auto w-full px-4 sm:px-8 group" dir="ltr">
          <div className="relative aspect-square sm:aspect-[4/3] md:aspect-[16/9] rounded-none overflow-hidden bg-surface border-[3px] border-jet">
            <div className="h-full w-full touch-pan-y" ref={emblaRef}>
              <div className="flex h-full w-full">
                {item.images.map((img, idx) => (
                  <div className="relative flex-[0_0_100%] h-full w-full min-w-0 flex items-center justify-center p-2 sm:p-6" key={idx}>
                    <img src={img} alt={`${item.title} - ${idx + 1}`} className="w-full h-full object-contain" />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Visual Indicators and Navigation */}
            {item.images.length > 1 && (
              <>
                <button aria-label="Previous image" onClick={scrollPrev} className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 bg-surface/90 hover:bg-surface border-[2px] border-jet shadow-sm transition-all sm:opacity-0 group-hover:opacity-100 z-10 cursor-pointer outline-none">
                  <ChevronLeft size={24} strokeWidth={2.5} className="text-jet" />
                </button>
                <button aria-label="Next image" onClick={scrollNext} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 bg-surface/90 hover:bg-surface border-[2px] border-jet shadow-sm transition-all sm:opacity-0 group-hover:opacity-100 z-10 cursor-pointer outline-none">
                  <ChevronRight size={24} strokeWidth={2.5} className="text-jet" />
                </button>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10 pointer-events-none">
                  {item.images.map((_, idx) => (
                    <div key={idx} className="w-2 h-2 bg-surface border-[1.5px] border-jet shadow-sm rounded-none" />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-10 max-w-4xl mx-auto w-full mt-4">
          <div className="inline-block px-4 py-1.5 mb-6 border-[2px] border-jet bg-surface text-[10px] font-bold text-jet tracking-widest uppercase">
            {statusLabels[item.status]}
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 sm:gap-6 mb-10" dir="rtl">
            <h1 className="text-4xl sm:text-6xl font-heading font-bold text-jet leading-tight text-right">
              {item.title}
            </h1>
            <p className="text-3xl sm:text-5xl font-bold font-sans text-stone tracking-tight sm:mt-2 shrink-0 text-left" dir="ltr">
              ₪{item.price.toLocaleString()}
            </p>
          </div>
          
          <div className="w-full h-[2px] bg-jet mb-10"></div>

          <div className="space-y-12 flex flex-col items-start w-full" dir="auto">
            <div className="w-full text-right" dir="rtl">
              <h3 className="text-sm font-hebrew-sans font-bold text-stone uppercase tracking-widest mb-4">קורות חיים</h3>
              <p className="text-jet leading-relaxed whitespace-pre-wrap text-[22px] sm:text-[26px] font-hebrew-sans font-medium">{item.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-8 w-full border-[3px] border-jet py-10 px-6 sm:px-8 bg-surface/80 backdrop-blur-sm" dir="rtl">
              <div className="text-right">
                <h3 className="text-xs font-hebrew-sans font-bold text-stone uppercase tracking-widest mb-3">מצב פיזי</h3>
                <p className="text-jet font-hebrew-sans font-bold text-xl sm:text-2xl">{item.condition}</p>
              </div>
              <div className="text-right">
                <h3 className="text-xs font-hebrew-sans font-bold text-stone uppercase tracking-widest mb-3">זמן מסירה</h3>
                <p className="text-jet font-hebrew-sans font-bold text-xl sm:text-2xl">{item.delivery_time === 'departure' ? 'סמוך לעזיבה (יוני)' : 'גמיש'}</p>
              </div>
              {item.dimensions && (
                <div className="text-right col-span-2">
                  <h3 className="text-xs font-hebrew-sans font-bold text-stone uppercase tracking-widest mb-3">מידות</h3>
                  <p className="text-jet font-hebrew-sans font-bold text-xl sm:text-2xl" dir="ltr">{item.dimensions}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-6 sm:p-8 bg-oatmeal md:bg-gradient-to-t md:from-oatmeal md:via-oatmeal md:to-transparent pointer-events-none z-10">
        <div className="max-w-2xl mx-auto w-full pointer-events-auto flex flex-col sm:flex-row justify-center gap-4">
          <a 
            href={generateWhatsAppLink(item.title, item.price, item.contact)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackShare('whatsapp')}
            className={`w-full sm:max-w-xs py-4 px-6 font-bold text-lg text-center flex items-center justify-center gap-3 transition-all outline-none border-[3px] border-jet shadow-[4px_4px_0px_theme(colors.jet)] active:translate-x-1 active:translate-y-1 active:shadow-none ${
              item.status === 'sold' 
                ? 'bg-stone/20 text-stone pointer-events-none border-stone/20 shadow-none' 
                : 'bg-[#25D366] text-jet hover:bg-[#1DA851]'
            }`}
          >
            <span className="font-hebrew-sans">צור קשר בווטסאפ</span>
            <ArrowUpRight size={22} strokeWidth={2.5} />
          </a>
          
          {item.fbMarketplaceLink && (
            <a 
              href={item.fbMarketplaceLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackShare('facebook')}
              className={`w-full sm:max-w-xs py-4 px-6 font-bold text-lg text-center flex items-center justify-center gap-3 transition-all outline-none border-[3px] border-jet shadow-[4px_4px_0px_theme(colors.jet)] active:translate-x-1 active:translate-y-1 active:shadow-none ${
                item.status === 'sold' 
                  ? 'bg-surface/50 text-stone pointer-events-none border-stone/20 shadow-none' 
                  : 'bg-[#1877F2] text-white hover:bg-[#0C63D4]'
              }`}
            >
              <Store size={22} strokeWidth={2.5} />
              <span className="font-sans">Marketplace</span>
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
