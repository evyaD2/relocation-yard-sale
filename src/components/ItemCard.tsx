/**
 * @file ItemCard.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import type { YardSaleItem } from '../types';

interface ItemCardProps {
  item: YardSaleItem;
  onClick: (item: YardSaleItem) => void;
}

export function ItemCard({ item, onClick }: ItemCardProps) {
  const statusColors = {
    available: 'bg-surface text-jet',
    pending: 'bg-surface text-stone',
    sold: 'bg-[#C0392B] text-surface',
  };

  const statusLabels = {
    available: 'זמין',
    pending: 'זמין',
    sold: 'נמכר',
  };

  return (
    <div 
      onClick={() => onClick(item)}
      className="group flex flex-col cursor-pointer outline-none bg-surface border-[3px] border-jet"
    >
      <div className="relative aspect-square overflow-hidden bg-border-subtle border-b-[3px] border-jet">
        {/* Subtle sophisticated hover zoom */}
        <img 
          src={item.images[0]} 
          alt={item.title} 
          className={`w-full h-full object-cover transition-transform duration-1000 ease-out ${item.status !== 'sold' ? 'group-hover:scale-105' : 'grayscale opacity-70'}`}
          loading="lazy"
        />
        <div className={`absolute top-2 left-2 sm:top-4 sm:left-4 px-1.5 py-0.5 sm:px-3 sm:py-1.5 text-[8px] sm:text-[10px] font-bold tracking-widest uppercase border-[1.5px] sm:border-[2px] border-jet ${statusColors[item.status]}`}>
          {statusLabels[item.status]}
        </div>
      </div>
      
      <div className="flex flex-col h-full bg-surface p-2.5 sm:p-5">
        <h3 className="font-heading font-bold text-jet text-sm sm:text-2xl leading-snug break-words mb-1 sm:mb-2 line-clamp-2" dir="rtl">
          {item.title}
        </h3>
        <p className="font-sans font-bold text-sm sm:text-2xl text-stone mt-auto tracking-tight shrink-0">
          ₪{item.price.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
