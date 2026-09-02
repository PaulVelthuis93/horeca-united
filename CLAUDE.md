# Horeca United — CLAUDE.md

## Project overview

Horeca United is a **Dutch-language** single-page application (SPA) that acts as a digital operating system for hospitality (horeca) entrepreneurs. It helps them benchmark and reduce operating costs by collectively negotiating with suppliers.

Deployed at: **https://paulvelthuis93.github.io/horeca-united/**

## Architecture

The app is split into source files under `src/` and built into a single `index.html` by `build.js`. GitHub Actions runs the build automatically on every push that touches `src/` or `build.js`.

```
src/
  style.css        ← all CSS (~260 lines)
  body.html        ← all HTML markup (~800 lines)
  app.js           ← all JavaScript (~1750 lines)
  template.html    ← head + placeholders (<!-- STYLE -->, <!-- BODY -->, <!-- SCRIPT -->)
build.js           ← Node.js build script (no dependencies), outputs index.html
index.html         ← GENERATED — do not edit directly
.github/workflows/build.yml  ← auto-build on push to main
```

**IMPORTANT: Never edit `index.html` directly. Always edit the source files in `src/` and run `node build.js` to regenerate it.**

- **State**: stored in `localStorage` under the key `huos_demo_state_v1`. The `STATE` object is the single source of truth for Quick Scan data.
- **Backend**: Supabase (auth, database, storage, edge functions). Project URL: `https://yyvzqnjumnpotawnrvfw.supabase.co`
- **Routing**: `Router.go(id)` switches between named screens by toggling `.active` on `<section>` elements.

## How to make changes

1. Edit the relevant file in `src/`:
   - CSS changes → `src/style.css`
   - HTML structure changes → `src/body.html`
   - JavaScript/logic changes → `src/app.js`
2. Run `node build.js` to regenerate `index.html`
3. Test by opening `index.html` in a browser (or `python3 -m http.server 8080`)
4. Commit **both** the `src/` file and the regenerated `index.html`

GitHub Actions will also auto-rebuild if you push only `src/` changes without running the build locally.

## Screens / sections

| Screen id | Description |
|---|---|
| `landing` | Marketing landing page |
| `scan` | 5-step Quick Scan wizard |
| `result` | Preliminary savings estimate |
| `dashboard` | Customer dashboard (tabbed) |
| `admin` | Internal Horeca United admin / lead overview |

## Key JavaScript modules (all in `src/app.js`)

- `SUBGROUPS` / `GROUP_ORDER` — master list of cost categories (subgroepen) and their groups
- `Router` — screen navigation
- `QuickScan` — wizard logic (5 steps, validation, file upload)
- `Engine` — savings calculation and profile-completion scoring
- `Dashboard` — customer dashboard rendering with async Supabase tabs:
  - `renderOverzicht()` — totals + benchmark chart from transactions
  - `renderDocuments()` — uploads per user
  - `renderContracten()` — contracts with urgency badges
  - `renderBesparingen()` — spend bar chart per category
  - `renderProfiel()` / `saveProfile()` — editable profile backed by `profiles` table
  - `renderOverzicht()` — benchmark vs group average from `benchmark_data` table
- `AuthUI` — magic link login modal, topbar auth state
- `AuthModule` — privacy & authorizations per data source (HANOS, Sligro, etc.)
- `AdminApp` — internal lead/pilot overview with scoring, filtering, sorting, detail modal, and machtigingen tab
- `DemoData` — reset helper
- `leadScore()` / `leadLabel()` — lead scoring algorithm

## Supabase tables

| Table | Description |
|---|---|
| `uploads` | File upload metadata per user |
| `extracted_data` | AI-extracted values from uploaded docs |
| `transactions` | Parsed transaction rows per user per category |
| `categories` | Cost categories (Gas, Elektra, Vlees, etc.) |
| `suppliers` | Supplier list (Hanos, Sligro, Overig) |
| `category_keywords` | Keywords for auto-categorisation |
| `profiles` | Editable business profile per user |
| `benchmark_data` | Group averages per category (admin-managed) |
| `data_sources` | Data sources for authorization module |
| `authorizations` | Granted permissions per user per data source |
| `authorization_events` | Immutable audit trail |

All tables have RLS enabled. Users can only read/write their own rows (`email = auth.jwt() ->> 'email'`).

## Pending / future work

- **Bevestigingsemail na upload**: Edge Function `send-upload-confirmation` is deployed. To activate: add `RESEND_API_KEY` to Supabase Edge Function secrets, then uncomment the two `// TODO` lines in `src/app.js` (search for `send-upload-confirmation`).
- **Benchmarkgrafiek**: code is in place, chart is hidden. Activate once enough real user data exists by removing the `display:none` guard in `renderOverzicht()`.

## Language

All user-facing text is in **Dutch (nl-NL)**. Keep new copy in Dutch. Currency formatting uses `nl-NL` locale via `Intl.NumberFormat`.

## CSS design tokens (`:root` variables in `src/style.css`)

| Token | Value | Use |
|---|---|---|
| `--brand` | `#163829` | Primary dark green |
| `--brand2` | `#2f6b4c` | Secondary medium green |
| `--bg` | `#f6f5f1` | Page background |
| `--card` | `#ffffff` | Card/panel background |
| `--line` | `#e3e0d5` | Borders |
| `--ink` | `#1f2a24` | Body text |
| `--muted` | `#6b7568` | Secondary text |
| `--positive-bg/ink` | green tints | Success states |
| `--warn-bg/ink` | amber tints | Warning states |
| `--danger-bg/ink` | red tints | Error states |

Fonts: `Fraunces` (display/headings), `Inter` (body), `IBM Plex Mono` (monospace/labels).

## Working conventions

- **Never edit `index.html` directly** — always edit `src/` files and run `node build.js`.
- No TypeScript, no transpilation — plain ES6+ JavaScript only.
- No npm/package.json — `build.js` uses only Node.js built-ins (`fs`, `path`).
- The app is responsive (breakpoint at 900 px); keep new UI mobile-friendly.
- Indicative savings calculations are intentionally approximate; they are not financial advice.

## Running locally

```bash
node build.js          # regenerate index.html from src/
python3 -m http.server 8080
# visit http://localhost:8080
```
