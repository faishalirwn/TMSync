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

First-run: load `.output/chrome-mv3`, open the popup, register the shown redirect URI in your
Trakt app, **Connect Trakt**, then **Enable scrobbling** (known site) or **Set it up with the
picker** (new site), and reload.

Upcoming: Shadow-DOM scrobble badge + correction UI, options page, recipe fetch-from-CDN,
cross-origin iframe coordination, background reconciliation of interrupted sessions.
