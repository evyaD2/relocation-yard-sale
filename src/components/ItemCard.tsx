import { Heart } from 'lucide-react';
import type { YardSaleItem } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useWishlist } from '../contexts/WishlistContext';
import { IMAGE_PLACEHOLDER, handleImageError } from '../utils/imageFallback';

interface ItemCardProps {
  item: YardSaleItem;
  onClick: (item: YardSaleItem) => void;
}

export function ItemCard({ item, onClick }: ItemCardProps) {
  const { t } = useLanguage();
  const { isLiked, toggle } = useWishlist();
  const isSold = item.status === 'sold';
  const liked = isLiked(item.id);

  return (
    <div
      onClick={() => onClick(item)}
      className={`group flex flex-col cursor-pointer bg-surface rounded-2xl overflow-hidden shadow-sm border border-border-subtle transition-all duration-300 ${
        !isSold ? 'hover:shadow-xl hover:-translate-y-1' : 'opacity-65'
      }`}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-oatmeal">
        <img
          src={item.images[0] || IMAGE_PLACEHOLDER}
          alt={item.title}
          onError={handleImageError}
          className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
            !isSold ? 'group-hover:scale-105' : 'grayscale'
          }`}
          loading="lazy"
        />
        {/* Status badge — direction-aware via start-3 */}
        <div
          className={`absolute top-3 start-3 px-2.5 py-1 text-[10px] sm:text-[11px] font-bold tracking-wide uppercase rounded-full ${
            isSold ? 'bg-[#DC2626] text-white' : 'bg-[#16A34A] text-white'
          }`}
        >
          {isSold ? t.sold : t.available}
        </div>

        {/* Wishlist heart — direction-aware, opposite corner from status. Hidden for sold items. */}
        {!isSold && (
          <button
            onClick={e => { e.stopPropagation(); toggle(item.id); }}
            className="absolute top-3 end-3 z-10 p-1.5 bg-white/85 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-all active:scale-90"
            aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart
              size={15}
              fill={liked ? '#E11D48' : 'none'}
              stroke={liked ? '#E11D48' : '#6E6E73'}
              strokeWidth={2}
            />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 sm:p-4 gap-1">
        <h3
          className="font-semibold text-jet text-sm sm:text-base leading-snug line-clamp-2"
          dir="auto"
        >
          {item.title}
        </h3>
        {(item.brand || item.model) && (
          <p className="text-stone text-xs leading-snug line-clamp-1" dir="auto">
            {[item.brand, item.model].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex items-baseline gap-2 mt-1" dir="ltr">
          <p className="font-black text-xl sm:text-2xl text-jet">
            ₪{item.price.toLocaleString()}
          </p>
          {item.originalPrice && item.originalPrice > item.price && (
            <p className="text-stone text-sm line-through">
              ₪{item.originalPrice.toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
