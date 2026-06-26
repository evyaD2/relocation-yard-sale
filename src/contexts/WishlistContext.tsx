import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const STORAGE_KEY = 'edry_wishlist';

interface WishlistContextType {
  wishlist: string[];
  toggle: (id: string) => void;
  isLiked: (id: string) => boolean;
  count: number;
}

const WishlistContext = createContext<WishlistContextType>({
  wishlist: [],
  toggle: () => {},
  isLiked: () => false,
  count: 0,
});

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

  const toggle = (id: string) =>
    setWishlist(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id],
    );

  return (
    <WishlistContext.Provider
      value={{ wishlist, toggle, isLiked: id => wishlist.includes(id), count: wishlist.length }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export const useWishlist = () => useContext(WishlistContext);
