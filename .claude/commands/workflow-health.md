---
description: "Check overall project health and workflow status"
---

# Workflow Health Check

Comprehensive project health check:

1. **Code Quality**:
   - Run `pnpm type-check` for TypeScript errors
   - Run `pnpm lint:check` for linting issues
   - Check for build errors with `pnpm build` (if dependencies are available)

2. **Git Status**:
   - Check for uncommitted changes
   - Verify branch status and recent commits
   - Check for merge conflicts or rebase issues

3. **Documentation Status**:
   - Verify TODO.md is current with recent work
   - Check CURRENT_STATE.md reflects latest architecture
   - Ensure CLAUDE.md guidelines are being followed

4. **Project State**:
   - Review current phase completion
   - Identify any blocking issues
   - Check service integrations and authentication status

Provide summary of any issues that need attention.