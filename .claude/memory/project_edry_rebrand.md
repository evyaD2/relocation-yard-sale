---
name: project-edry-rebrand
description: Edry family yard sale site — rebrand from Gidonys, e-commerce UX upgrade, Hebrew/English bilingual system
metadata:
  type: project
---

This is a React + Vite + TypeScript yard sale website for the Edry family (משפחת אדרי), rebranded from the original Gidonys family site.

**Key architecture decisions:**
- Language context lives at `src/contexts/LanguageContext.tsx` — Hebrew default, toggle to English via a fixed pill button (top-end corner)
- `document.dir` switches to `rtl`/`ltr` based on language, so the whole page re-flows natively
- All user-visible strings go through `const { t } = useLanguage()` — never hardcoded
- Rubik font handles both Hebrew and Latin scripts (single font import)

**Design tokens (index.css @theme):**
- `oatmeal`: `#F8F5F0` warm canvas
- `jet`: `#111111` near-black
- `stone`: `#6B6260` warm muted
- `border-subtle`: `#E4DDD6`
- CTA orange (inline): `#D4470C`
- Available badge (inline): `#16A34A`
- Sold badge (inline): `#DC2626`
- Hero image offset shadow (inline): `#D4470C`

**Design style:** rounded cards with soft shadows (no hard borders), pill-style category filter, RTL-first layout.

**Why:** User is from the Edry family; this is their personal yard sale site adapted from a template built for a different family.
