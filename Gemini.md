# 🤖 System Instructions for Gemini & AI Agents

Welcome to the **Gidony Yard Sale** repository. This file serves as your primary context anchor. Before executing modifications to this codebase, carefully review the instructions and architectural rules below.

## 1. Project Overview
This project is a high-end, responsive Single Page Application (SPA) designed to help the Gidony family sell their curated home goods, furniture, and technology as they relocate to Vienna. 

* The public-facing **Storefront** handles displaying the catalog, modal product detail views, and WhatsApp routing.
* The private **Admin Dashboard** (`/admin`) handles secure CRUD operations, bulk image uploads, and inventory tracking.

## 2. Tech Stack
* **Framework:** React 19 + Vite + TypeScript
* **Styling:** Tailwind CSS (Strictly adhered to the custom palette in `tailwind.config.js`)
* **Animations:** Framer Motion & Embla Carousel
* **Backend:** Supabase (Postgres Database, Edge Storage)
* **Hosting:** Vercel

## 3. Mandatory Design Language: "Editorial Brutalist"
DO NOT simplify the UI or revert to generic web design aesthetics. The application aims for a premium, magazine-like feel:
* **Palette:** Rely strictly on the custom `surface`, `jet`, `stone`, and `oatmeal` definitions. 
* **Typography:** Bold `heading` classes and tight tracking.
* **Borders & Shadows:** Use thick structural lines (e.g., `border-[3px] border-jet`) and solid drop-shadow offsets (e.g., `shadow-[4px_4px_0px_theme(colors.jet)]`). Avoid soft, feathered box-shadows.

## 4. Backend Rules (Supabase)
* **Row Level Security (RLS)** is strictly enforced.
* Read access for the `yard_sale_items` table is public. 
* Insert, Update, Delete, and Storage Bucket privileges require the user to be authenticated.
* All data fetching and backend mutations must route natively through the typed functions in `src/api/items.ts`. Do not write raw fetch calls in components.

## 5. Environment Variables
Local development strictly requires `.env.local` featuring:
1. `VITE_SUPABASE_URL`
2. `VITE_SUPABASE_ANON_KEY`
3. `VITE_SUPABASE_SERVICE_ROLE_KEY` (Used specifically for backend NodeJS scripts, never in the React app).

## 6. Current Progress Status
✅ **Phase 1 (Static MVP)** Completed.
✅ **Phase 2 (Dynamic Backend)** Completed. Migrated from raw JSON to Supabase. Real-time updates, image storage, and admin dashboard logic are functional.
⏳ **Phase 3 (Automation)** Next up. Focus on Cron Jobs, Vercel Web Analytics, and smart automated WhatsApp digests. See `docs/roadmap.md` for full details.
