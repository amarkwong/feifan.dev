# Copilot Instructions

## Architecture snapshot
- Single-page Astro site (`src/pages/index.astro`) rendered through `Layout.astro`, which injects the fixed `Navbar` plus a `<slot>` for page content.
- `Layout` requires a `title` prop; the same string drives the `<title>` tag and Navbar logo, so keep it authoritative for any new route.
- Content sections (`about`, `experience`, `projects`, `thoughts`) feed both in-page anchors and navbar links—change IDs and nav labels together.

## Build & verification workflow
- Install once with `npm install`, then use `npm run dev`/`npm start` for the dev server (Astro defaults to http://localhost:4321).
- `npm run build` runs `astro check` before `astro build`, so TypeScript/template errors must be resolved before assets emit.
- `npm run preview` serves the production `dist/` output; use it when debugging asset paths like `/styles/global.css` or `/favicon.svg`.

## Layout + navigation contracts
- `Navbar.astro` is fixed to the top of the viewport; `Layout` sets `main { padding-top: 4rem; }` to keep content visible—update both when tweaking nav height.
- Anchored links are hard-coded to the four section IDs (about, experience, projects, thoughts) and assume each `<section>` stays in the same order as the navbar list; keep that ordering or scrolling will feel broken.
- Global head links (currently only `/styles/global.css`) must reference files under `public/` so they survive the build.

## Component patterns
- Keep components tiny and colocate styles inside `.astro` files; `Card.astro` shows the house style with an inline `Props` interface and `Astro.props` destructuring.
- When expanding `Card`, keep the `{ title, body, href }` contract intact or TypeScript (strict via `tsconfig.json`) will fail during `astro check`.
- Prefer adding new sections/content by composing existing components rather than editing Layout, unless you need site-wide chrome changes.

## Styling & assets
- There is no `public/styles/global.css` yet—create it under `public/styles/` if you need real global tokens, because `Layout` already links to that path.
- Component styles default to neutral grayscale; introduce new palettes via CSS variables (see `Card`'s `--accent-gradient` usage) to stay consistent.
- Static assets belong in `public/` and should be referenced with absolute paths (`/images/...`) so Astro copies them untouched.

## Tips for AI agents
- `tsconfig.json` extends `astro/tsconfigs/strict`; define interfaces/types for every prop change and prefer TypeScript-aware APIs.
- Add third-party integrations through `astro.config.mjs` (currently bare) so the build pipeline understands them.
- Before landing UI or content work, run `npm run build` to catch template/type regressions; docs-only updates can skip the build.
