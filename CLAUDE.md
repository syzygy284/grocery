# Grocery

Personal grocery list PWA. Single user, used mainly on an iPhone in the store (Android nice-to-have), desktop later. Dark mode only.

## Stack
- React 19 + TypeScript + Vite, installed as a PWA via `vite-plugin-pwa`
- Local-only storage in IndexedDB via Dexie (`src/db.ts`); UI reads with `useLiveQuery`
- `@dnd-kit` for drag-to-reorder, `lucide-react` icons, plain CSS in `src/index.css`

## Commands
- `npm run dev` — dev server (also exposed on LAN via `server.host`)
- `npm run build` — type-check + production build (run this to verify changes)
- `npm run lint` — oxlint
- `node scripts/make-icons.mjs` — regenerate PNG app icons in `public/`

## Product rules
- Items are permanent records that move between `status`: `list` (need) → `cart` (checked) → `off` (not needed). Never re-create an item that exists; re-use it so walking order, unit, and history carry over.
- There are no categories. `sortOrder` is the user's walking order through the store; reordering uses fractional values between neighbours (`moveBetween`).
- Tracking stays lightweight: a trip logs date + total (+ optional store); per-item purchase records are created automatically from checked items. Never ask for per-item prices.
- Suggestions come from purchase frequency (`src/suggest.ts`), are yes/no, and can be turned off or paused in Settings.
- Units are free text with presets; `step` controls +/-; `usualQty` is restored when an item is re-added.

## Sync-readiness (don't break)
Every record has a UUID `id`, an `updatedAt` timestamp, and soft-delete `deleted` flag. Always set `updatedAt` on writes and soft-delete instead of removing rows. Sync itself is not built yet.

## Gotchas
- iOS requires HTTPS for service workers / install; LAN http works for UI testing only. `uid()` has a fallback because `crypto.randomUUID` is missing on insecure origins.
- Inputs must be ≥16px font or iOS Safari zooms on focus.
- Multi-step DB writes go in `db.transaction` (rapid adds raced before this).
