import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { Share2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { ShareMenu } from '../ShareMenu';

export function Layout({ children }: { children: ReactNode }) {
  const { scrollYProgress } = useScroll();
  const { t, toggle } = useLanguage();
  const [showShare, setShowShare] = useState(false);

  const handleShare = async () => {
    const shareData = {
      title: 'מכירת חצר של משפחת אדרי',
      text: 'בדקו את מכירת החצר של משפחת אדרי! 🏡',
      url: window.location.origin,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    setShowShare(true);
  };

  return (
    <div className="min-h-screen bg-oatmeal text-jet font-sans antialiased relative z-0">
      {/* Subtle background shapes */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <svg
          className="absolute -top-[10%] -left-[10%] w-[500px] h-[500px] text-[#DBEAFE] opacity-60 animate-[spin_60s_linear_infinite]"
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="currentColor"
            d="M37.8,-63.3C52,-54.6,68.7,-48.1,76.5,-35.1C84.3,-22.2,83.1,-2.6,76.7,14.6C70.3,31.7,58.7,46.4,44.9,56.5C31,66.6,15.5,72.1,1.1,70.2C-13.3,68.3,-26.6,59.1,-41.6,50.1C-56.5,41.2,-73.2,32.6,-80.7,18.8C-88.3,5,-86.6,-14,-78.3,-29.4C-69.9,-44.8,-54.8,-56.7,-40,-65.2C-25.2,-73.6,-12.6,-78.5,0.7,-79.7C14,-80.9,28,-78.4,37.8,-63.3Z"
            transform="translate(100 100) scale(1.1)"
          />
        </svg>
        <svg
          className="absolute top-[30%] -right-[5%] w-[350px] h-[350px] text-[#BFDBFE] opacity-50"
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="100" cy="100" r="80" fill="currentColor" />
        </svg>
      </div>

      {/* Scroll progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-[#2563EB] origin-left z-50"
        style={{ scaleX: scrollYProgress }}
      />

      {/* Fixed top-end controls: share + language toggle */}
      <div className="fixed top-4 end-4 z-50 flex items-center gap-2">
        <button
          onClick={handleShare}
          className="p-2 text-stone hover:text-jet bg-surface border border-border-subtle rounded-full shadow-sm hover:shadow-md hover:bg-oatmeal transition-all"
          aria-label={t.shareApp}
        >
          <Share2 size={15} strokeWidth={2.5} />
        </button>
        <button
          onClick={toggle}
          className="px-3.5 py-1.5 text-xs font-bold tracking-widest uppercase bg-surface border border-border-subtle rounded-full shadow-sm hover:shadow-md hover:bg-oatmeal transition-all"
          aria-label="Toggle language"
        >
          {t.switchLang}
        </button>
      </div>

      <main className="max-w-3xl mx-auto w-full flex flex-col items-center pb-20">
        {children}
      </main>

      <AnimatePresence>
        {showShare && (
          <ShareMenu
            url={window.location.origin}
            title="מכירת חצר של משפחת אדרי"
            text="בדקו את מכירת החצר של משפחת אדרי! 🏡"
            onClose={() => setShowShare(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
