import type { YardSaleItem } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface ItemCardProps {
  item: YardSaleItem;
  onClick: (item: YardSaleItem) => void;
}

export function ItemCard({ item, onClick }: ItemCardProps) {
  const { t } = useLanguage();
  const isSold = item.status === 'sold';

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
          src={item.images[0]}
          alt={item.title}
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
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 sm:p-4 gap-1">
        <h3
          className="font-semibold text-jet text-sm sm:text-base leading-snug line-clamp-2"
          dir="auto"
        >
          {item.title}
        </h3>
        <p className="font-black text-xl sm:text-2xl text-jet mt-1" dir="ltr">
          ₪{item.price.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
