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
  },
} as const;

/** Localised display names for category slugs coming from the sheet. */
export const CATEGORY_LABELS: Record<string, Record<Lang, string>> = {
  appliance:  { he: 'מוצרי חשמל', en: 'Appliances' },
  furniture:  { he: 'רהיטים',     en: 'Furniture'  },
  other:      { he: 'אחר',        en: 'Other'       },
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
