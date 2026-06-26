import { motion } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';

export function Hero() {
  const { t } = useLanguage();

  return (
    <div className="w-full flex flex-col items-center justify-center pt-16 pb-10 px-6 overflow-hidden">
      {/* Image with CTA-orange offset shadow */}
      <motion.div
        initial={{ opacity: 0, y: 50, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[240px] sm:max-w-xs mx-auto mb-10 group cursor-default"
      >
        <div className="absolute inset-0 bg-[#2563EB] translate-x-3 translate-y-3 sm:translate-x-4 sm:translate-y-4 transition-transform group-hover:translate-x-5 group-hover:translate-y-5 duration-700 ease-out rounded-2xl" />
        <img
          src="/family.jpg"
          alt="משפחת אדרי"
          className="relative w-full h-auto object-cover rounded-2xl bg-surface shadow-sm"
        />
      </motion.div>

      {/* Typography block */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="text-center max-w-xl mx-auto"
      >
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="text-jet text-2xl sm:text-3xl font-bold tracking-wide mb-3"
        >
          {t.heroFamily}
        </motion.p>

        <h1 className="text-5xl sm:text-[5.5rem] font-black text-jet leading-none mb-4">
          {t.heroTitle}
        </h1>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-14 h-1 bg-[#2563EB] mx-auto mb-5 origin-center rounded-full"
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="text-stone text-sm sm:text-base font-medium"
        >
          {t.heroTagline}{' '}
          <span className="text-[#2563EB] font-bold mx-1">•</span>{' '}
          <span className="font-bold text-jet">{t.heroTagline2}</span>
        </motion.p>
      </motion.div>
    </div>
  );
}
