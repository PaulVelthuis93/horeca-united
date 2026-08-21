# Horeca United — CLAUDE.md

## Project overview

Horeca United is a **Dutch-language** single-page application (SPA) that acts as a digital operating system for hospitality (horeca) entrepreneurs. It helps them benchmark and reduce operating costs by collectively negotiating with suppliers.

The entire app lives in a **single file**: `index.html`. There is no build step, no package manager, no framework, no server — it runs directly in the browser.

## Architecture

- **One file**: `index.html` contains all HTML, CSS (in a `<style>` block), and JavaScript (in a `<script>` block at the bottom).
- **No dependencies** (except Google Fonts loaded via CDN).
- **State**: stored in `localStorage` under the key `huos_demo_state_v1`. The `STATE` object is the single source of truth.
- **Routing**: `Router.go(id)` switches between named screens by toggling `.active` on `<section>` elements.

## Screens / sections

| Screen id | Description |
|---|---|
| `landing` | Marketing landing page |
| `scan` | 5-step Quick Scan wizard |
| `result` | Preliminary savings estimate |
| `dashboard` | Customer dashboard (tabbed) |
| `admin` | Internal Horeca United admin / lead overview |

## Key JavaScript modules (all in `<script>`)

- `SUBGROUPS` / `GROUP_ORDER` — master list of cost categories (subgroepen) and their groups
- `Router` — screen navigation
- `QuickScan` — wizard logic (5 steps, validation, file upload)
- `Engine` — savings calculation and profile-completion scoring
- `Dashboard` — customer dashboard rendering (tabs: overzicht, subgroepen, documenten, contracten, besparingen, machtigingen, profiel)
- `AdminApp` — internal lead/pilot overview with scoring, filtering, sorting, and detail modal
- `DemoData` — reset helper
- `leadScore()` / `leadLabel()` — lead scoring algorithm

## Language

All user-facing text is in **Dutch (nl-NL)**. Keep new copy in Dutch. Currency formatting uses `nl-NL` locale via `Intl.NumberFormat`.

## CSS design tokens (`:root` variables)

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

- All changes happen in `index.html` — do not create separate JS/CSS files.
- This is a **demo / prototype** — there is no backend, no real file upload, no actual data persistence beyond `localStorage`.
- Indicative savings calculations are intentionally approximate; they are not financial advice.
- The app is responsive (breakpoint at 900 px); keep new UI mobile-friendly.
- No TypeScript, no transpilation — plain ES6+ JavaScript only.

## Running the app

Open `index.html` directly in a browser. No server required. For live-editing, any static file server works:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```
