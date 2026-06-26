/**
 * @file Hero.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { motion } from 'framer-motion';

export function Hero() {
  return (
    <div className="w-full flex flex-col items-center justify-center pt-20 pb-16 px-6 overflow-hidden">
      {/* Editorial Sharp Image Frame with Crimson Shadow Offset */}
      <motion.div 
        initial={{ opacity: 0, y: 50, rotate: -3 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[280px] sm:max-w-sm mx-auto mb-12 group cursor-default"
      >
        <div className="absolute inset-0 bg-[#D4940A] translate-x-3 translate-y-3 sm:translate-x-4 sm:translate-y-4 transition-transform group-hover:translate-x-5 group-hover:translate-y-5 duration-700 ease-out border-[3px] border-jet"></div>
        <img
          src="/yardsale.jpg"
          alt="The Edry Yard Sale Sign"
          className="relative w-full h-auto object-cover rounded-none border-[3px] border-jet bg-surface"
        />
      </motion.div>
      
      {/* Typography */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="text-center max-w-2xl mx-auto"
      >
        <h1 className="text-5xl sm:text-7xl font-bold font-heading text-jet mb-6 leading-none">
          The Edry's<br />
          <span className="font-black text-[#C0392B]">Yard Sale</span>
        </h1>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-16 h-[3px] bg-[#C0392B] mx-auto mb-6 origin-center"
        />
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="text-stone text-[11px] sm:text-[13px] font-bold tracking-[0.25em] uppercase w-full max-w-full"
        >
          פריטים מיוחדים מהבית <span className="mx-2 opacity-50">&bull;</span> הכל למכירה
        </motion.p>
      </motion.div>
    </div>
  );
}
