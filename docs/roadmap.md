# Product & Development Roadmap: Gidony Yard Sale App

## Phase 1: MVP - The Static Frontend (Current Focus)
**Goal:** Quickly deploy a beautiful, static front-end so buyers can view items and initiate contact.
* **Tech Stack:** React + Vite, Tailwind CSS, Vercel
* **Tasks:**
  * [x] Scaffold the raw Vite React project.
  * [x] Create the global Layout and Hero component featuring the custom sign.
  * [x] Build the mobile-first CSS architecture with the `Soft Canvas` palette.
  * [x] Develop the `ItemGrid` and `ItemCard` component.
  * [x] Develop the expansive `ItemDetails` view/modal with Embla Carousel.
  * [x] Hook up the "WhatsApp Contact" deep-links.
  * [x] Create the `data.json` CMS file and populate initial listings.
  * [x] Deploy to Vercel for immediate public access.

---

## 🛑 AGENT HANDOFF NOTES FOR PHASE 2
**Dear Next Agent:** The user is officially entering **Phase 2: Dynamic Backend & Portal**.
Before writing any code, please review the following context from Phase 1:
1. **Current State:** The MVP is deployed live on Vercel at `yard-sale.gidonys.com` (and `gidonys-yard-sale.vercel.app`). 
2. **Tech Stack:** It is a Single Page Application (SPA) built with React 19, Vite, TypeScript, Tailwind CSS, and Framer Motion. 
3. **Routing:** We have a `vercel.json` set up for SPA rewrite mapping to `index.html`. If you add route-based auth or new pages (like `/admin`), ensure Vite and Vercel routing remains intact.
4. **Data:** Currently, the items are hardcoded in `src/data.ts` (or `data.json`). Your primary goal is to migrate this static model to a real database (e.g., Supabase or Firebase) without breaking the existing UI.
5. **Design Aesthetics:** The app uses a highly curated "Editorial Brutalist" design utilizing `framer-motion` for smooth micro-interactions, `embla-carousel-react` for image galleries, and a specific high-end color palette. **Do not deviate from or simplify the design language.** Keep it premium.
6. **Task Priority:** Begin by analyzing UI components (`ItemGrid.tsx`, `App.tsx`) to understand the `YardSaleItem` interface before swapping it out for a live backend API structure.

---

## Phase 2: Dynamic Backend & Portal (Completed)
**Goal:** Transition from static data to a live database, adding a secure admin route for real-time inventory management.
* **Tech Stack:** Supabase API integration (Postgres Database, Storage).
* **Tasks:**
  * [x] Migrate the `YardSaleItem` static schema to a Postgres database (Supabase).
  * [x] Build API fetch wrappers in the frontend to replace static imports.
  * [x] Create a hidden `/admin` dashboard exclusively for the family to manage stock.
  * [x] Add basic authentication (Password) for the admin route.
  * [x] Implement admin toggle features: Edit items, add/remove photos, bulk uploads, reorder covers, delete items, and change contacts.
  * [x] Add Vercel Web Analytics or PostHog to track views per item.

## Phase 3: Automation & AI Insights (The Future)
**Goal:** Hook up daily digest notifications and intelligent pricing suggestions via WhatsApp bots.
* **Tasks:**
  * [ ] Configure a Cron Job (Vercel Cron or GitHub Actions) to run nightly.
  * [ ] Hook the Cron job to query the database for "Daily Views" and "Stale Items".
  * [ ] Implement an LLM call or simple rules engine for smart recommendations (e.g., "Drop the price of X by 10%").
  * [ ] Integrate Twilio or WhatsApp Business API.
  * [ ] Send automated digest message directly to the family's WhatsApp group every morning.

---

## 🐛 Known Issues & Backlog

* [x] **Analytics: Line chart hover UX** — Migrated from hand-rolled SVG to **Recharts**. Native tooltip snaps to data points, custom `BrutalistTooltip` preserves the editorial design. Eliminated the crosshair hack and info strip workaround.
* [x] **Mobile storefront layout** — Switched to a **2-column grid** on mobile with square card images, compact text, and tighter spacing. ~4 items visible above the fold on a standard phone (was ~1).
