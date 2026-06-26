/**
 * @file ItemGrid.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useDragControls } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ItemCard } from './ItemCard';
import type { YardSaleItem } from '../types';

interface ItemGridProps {
  items: YardSaleItem[];
  onSelectItem: (item: YardSaleItem) => void;
}

const playClickSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    console.warn('Audio context failed', e);
  }
};

export function ItemGrid({ items, onSelectItem }: ItemGridProps) {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isAdmin, setIsAdmin] = useState(false);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // Motion values for swipe gesture
  const dragX = useMotionValue(0);
  const foregroundX = useTransform(dragX, [0, 150], [0, 120]);
  const gearRotate = useTransform(dragX, [0, 150], [0, 180]);
  const drawerOpacity = useTransform(dragX, [0, 5, 40], [0, 0, 1]);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAdmin(!!session);
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(items.map(item => item.category));
    return ['All', ...Array.from(cats)];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'All') return items;
    return items.filter(item => item.category === activeCategory);
  }, [items, activeCategory]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (gridRef.current) {
        const gridTop = gridRef.current.getBoundingClientRect().top + window.scrollY;
        const targetScroll = gridTop - 120;
        if (window.scrollY > targetScroll) {
          window.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeCategory]);

  const handleDragEnd = (_: any, info: any) => {
    if (isAdmin && info.offset.x > 80) {
      playClickSound();
      if (navigator.vibrate) navigator.vibrate([15, 10, 15]);
      navigate('/admin');
    }
    dragX.stop();
    dragX.set(0);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Floating Filter Board with Admin Swipe Logic */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="sticky top-6 z-40 w-full px-4 sm:max-w-fit mx-auto overflow-visible select-none font-sans"
      >
        <div className="relative overflow-hidden bg-jet border-[3px] border-jet shadow-[6px_6px_0px_theme(colors.jet)] max-w-full">
          
          <motion.div 
            style={{ opacity: drawerOpacity }}
            className="absolute inset-0 bg-red-600 flex items-center justify-start px-10 z-0"
          >
             <motion.span 
              style={{ rotate: gearRotate }}
              className="text-surface text-4xl font-bold drop-shadow-[2px_2px_0px_rgba(0,0,0,0.5)]"
             >
              ⚙
             </motion.span>
          </motion.div>

          <motion.div 
            drag={isAdmin ? "x" : false}
            dragControls={dragControls}
            dragListener={false}
            _dragX={dragX}
            style={{ x: foregroundX }}
            dragConstraints={{ left: 0, right: 180 }}
            dragElastic={0.05}
            onDragEnd={handleDragEnd}
            onDrag={(_e, info) => dragX.set(info.offset.x)}
            className={`relative z-10 bg-surface transition-shadow duration-300 w-full flex items-center py-2 px-4 sm:px-6 min-w-0 max-w-full`}
          >
            <motion.div 
              style={{ opacity: drawerOpacity }}
              className="absolute left-0 top-0 bottom-0 w-[3px] bg-jet z-20"
            />
            
            <div className="w-full flex items-center max-w-full min-w-0">
                <button 
                  onPointerDown={(e) => isAdmin && dragControls.start(e)}
                  onClick={() => setActiveCategory('All')}
                  className={`relative z-10 shrink-0 px-4 sm:px-6 py-2.5 sm:py-3.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-none outline-none transition-colors ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'none' }}
                >
                  {activeCategory === 'All' && (
                    <div className="absolute inset-0 bg-[#D4940A] border-[2px] border-jet z-0 transition-opacity duration-300" />
                  )}
                  <span className={`relative z-10 transition-colors duration-300 ${activeCategory === 'All' ? 'text-jet' : 'text-stone hover:text-jet'}`}>
                    All
                  </span>
                </button>

                <div className="w-[2px] h-6 bg-jet/20 mx-3 shrink-0 rounded-full" />

                <div className="flex-1 overflow-x-auto no-scrollbar flex items-center space-x-1 sm:space-x-2 snap-x snap-mandatory scroll-smooth min-w-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {categories.filter(c => c !== 'All').map((category) => (
                      <button 
                        key={category}
                        onClick={() => setActiveCategory(category)}
                        className="relative z-10 shrink-0 snap-center px-4 sm:px-6 py-2.5 sm:py-3.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-none outline-none transition-colors border-2 border-transparent"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        {activeCategory === category && (
                          <div className="absolute inset-0 bg-[#D4940A] border-[2px] border-jet z-0 transition-opacity duration-300" />
                        )}
                      <span className={`relative z-10 transition-colors duration-300 ${activeCategory === category ? 'text-jet' : 'text-stone hover:text-jet'}`}>
                        {category}
                      </span>
                    </button>
                  ))}
                </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <div 
        ref={gridRef}
        className="p-3 sm:p-6 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-10 max-w-5xl mx-auto w-full pt-6 sm:pt-10"
      >
        {filteredItems.map((item, index) => (
          <motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.7, delay: (index % 3) * 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <ItemCard item={item} onClick={onSelectItem} />
          </motion.div>
        ))}
        {filteredItems.length === 0 && (
          <div className="col-span-full py-20 text-center text-stone font-medium text-lg">
            No items available in this category.
          </div>
        )}
      </div>
    </div>
  );
}
