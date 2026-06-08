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

Milestone 0+1 (foundation + engine) is in place: the monorepo, the `@tmsync/shared`
schema + pure `extract()`/`matchRecipe` engine with tests, and the WXT skeleton with the
correct MV3 permission posture (no broad host access at install — see constraint #5).
Trakt OAuth + scrobble state machine, the Shadow-DOM badge, the element picker, and the
options page are upcoming milestones.
