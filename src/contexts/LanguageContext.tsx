import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Lang = 'he' | 'en';

export const T = {
  he: {
    heroFamily: 'משפחת אדרי',
    heroTitle: 'מכירת חצר',
    heroTagline: 'פריטים מיוחדים מהבית',
    heroTagline2: 'הכל למכירה',
    available: 'זמין',
    sold: 'נמכר',
    loading: 'טוען מלאי...',
    allCategories: 'הכל',
    noItems: 'אין פריטים בקטגוריה זו',
    descriptionLabel: 'תיאור',
    conditionLabel: 'מצב',
    deliveryLabel: 'זמן מסירה',
    dimensionsLabel: 'מידות',
    deliveryDeparture: 'סמוך לעזיבה (יולי)',
    deliveryFlexible: 'גמיש',
    ctaWhatsapp: 'יצירת קשר בוואטסאפ',
    ctaMarketplace: 'מרקטפלייס',
    linkCopied: '!הקישור הועתק',
    switchLang: 'EN',
    wishlist: 'מועדפים',
    wishlistEmpty: 'הרשימה ריקה',
    wishlistEmptyHint: 'לחץ/י על ♡ כדי להוסיף פריטים',
    inquireAll: 'שאל/י על כל הפריטים בוואטסאפ',
    shareApp: 'שתף',
    copyLink: 'העתק קישור',
    originalPriceLabel: 'מחיר מקורי',
    brandLabel: 'מותג / חנות',
    modelLabel: 'דגם',
  },
  en: {
    heroFamily: "The Edry's",
    heroTitle: 'Yard Sale',
    heroTagline: 'Curated pieces from our home',
    heroTagline2: 'Everything must go',
    available: 'Available',
    sold: 'Sold',
    loading: 'Loading inventory...',
    allCategories: 'All',
    noItems: 'No items in this category',
    descriptionLabel: 'About',
    conditionLabel: 'Condition',
    deliveryLabel: 'Delivery',
    dimensionsLabel: 'Dimensions',
    deliveryDeparture: 'Near departure (July)',
    deliveryFlexible: 'Flexible',
    ctaWhatsapp: 'Contact on WhatsApp',
    ctaMarketplace: 'Marketplace',
    linkCopied: 'Link copied!',
    switchLang: 'עב',
    wishlist: 'Wishlist',
    wishlistEmpty: 'Your wishlist is empty',
    wishlistEmptyHint: 'Tap ♡ on any item to save it here',
    inquireAll: 'Inquire about all items on WhatsApp',
    shareApp: 'Share',
    copyLink: 'Copy Link',
    originalPriceLabel: 'Original Price',
    brandLabel: 'Brand / Store',
    modelLabel: 'Model',
  },
} as const;

/** Localised display names for category slugs coming from the sheet. */
export const CATEGORY_LABELS: Record<string, Record<Lang, string>> = {
  appliance: { he: 'מוצרי חשמל', en: 'Appliances' },
  furniture: { he: 'רהיטים', en: 'Furniture' },
  other:     { he: 'אחר', en: 'Other' },
};

/** Localised display names for condition values coming from the sheet. */
export const CONDITION_LABELS: Record<string, Record<Lang, string>> = {
  excellent: { he: 'מצוין',    en: 'Excellent' },
  like_new:  { he: 'כמו חדש', en: 'Like New'  },
  good:      { he: 'טוב',     en: 'Good'       },
  fair:      { he: 'סביר',    en: 'Fair'        },
  used:      { he: 'משומש',   en: 'Used'        },
};

type Translations = typeof T.he | typeof T.en;

interface LangContextType {
  lang: Lang;
  t: Translations;
  toggle: () => void;
}

const LangContext = createContext<LangContextType>({
  lang: 'he',
  t: T.he,
  toggle: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('he');

  useEffect(() => {
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const toggle = () => setLang(l => (l === 'he' ? 'en' : 'he'));

  return (
    <LangContext.Provider value={{ lang, t: T[lang], toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLanguage = () => useContext(LangContext);
