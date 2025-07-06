---
description: "Identify and start next priority task based on current project state"
---

# Next Task Identification

Analyze current project state and identify next priority task:

1. Review TODO.md for current phase and pending tasks
2. Check git status for uncommitted work
3. Verify system health with `pnpm type-check`
4. Identify highest priority task based on:
   - Phase 4 priorities in TODO.md
   - Known issues that need resolution
   - Architectural improvements needed
5. Create TodoWrite entry for the selected task
6. Begin implementation

Focus on problems that provide the most user value and align with the current development phase.