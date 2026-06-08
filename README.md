# TMSync

Cross-browser (Chrome + Firefox) WebExtension that passively scrobbles **movies & TV
shows to Trakt** while you watch on arbitrary streaming sites, using declarative
**recipes** (data, not code). See [`TMSync-PRD.md`](./TMSync-PRD.md) for the what/why and
[`CLAUDE.md`](./CLAUDE.md) for the settled architecture and constraints.

## Monorepo layout

```
packages/shared      # recipe schema (Zod) + types + pure extraction engine (no DOM/browser globals)
packages/extension   # WXT app: entrypoints (background, content), messaging, options (later)
recipes/             # versioned JSON recipe list (Phase 1 source of truth, PR-contributed)
```

## Develop

```bash
pnpm install            # also runs `wxt prepare`
pnpm dev                # Chrome dev (HMR)
pnpm dev:firefox        # Firefox dev
pnpm build              # build chrome-mv3 → packages/extension/.output
pnpm build:firefox      # build firefox-mv2

pnpm test               # vitest across packages
pnpm typecheck          # tsc --noEmit across packages
pnpm lint               # biome (format + lint)
pnpm format             # biome format --write
```

## Status

In place:
- **Foundation + engine** — monorepo, `@tmsync/shared` schema + pure `extract()`/`matchRecipe`,
  recipe-snapshot tests. MV3 posture: no broad host access at install (constraint #5).
- **Trakt + scrobbling** — OAuth (`launchWebAuthFlow`) + token refresh, search-based resolution
  with caching, real-time `/scrobble start|pause|stop`, and a content-side state machine
  (debounce, one start/session, stop on ended/leave).
- **Element picker** — uBlock-style point-and-click (`@medv/finder`) in a Shadow-DOM overlay with
  auto-detect + live extract preview; saves a custom recipe and enables the site.

Also handled: a Shadow-DOM **scrobble badge** showing the live state **and what Trakt matched**,
**click-to-correct** (search Trakt and fix a wrong match, remembered per scraped title),
**SPA navigation** + late metadata (re-matches when the route/episode/og:title changes),
same-page **and** cross-origin **iframe players** (only one frame scrobbles per tab), background
**reconciliation** (a stop if a tab dies), and **re-registration on startup** (a plain extension
reload re-enables your sites).

First-run (Chrome):
1. `pnpm build` → load `.output/chrome-mv3` unpacked. The extension ID is stable
   (`aplaigellojlejhdjkklgihlmbmdaebk`). **After later `pnpm build`s, just hit the reload ↻ on the
   extension card — no need to remove/re-add; enabled sites re-register automatically.**
2. In your Trakt app (trakt.tv/oauth/applications) set the Redirect URI to
   `https://aplaigellojlejhdjkklgihlmbmdaebk.chromiumapp.org/`.
3. Popup → **Connect Trakt**.
4. On a media page → **Enable** the site (and any player-frame origin the popup lists), or **Set it
   up with the picker** for a new site. Reload, press play.
5. The badge shows live state + the matched title. Wrong match? Click the badge → search → pick.

Upcoming: options page (manage sites/corrections), recipe fetch-from-CDN.
