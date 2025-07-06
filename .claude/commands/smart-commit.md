---
description: "Commit current work with proper message format following CLAUDE.md guidelines"
---

# Smart Commit

Commit current work following CLAUDE.md commit strategy:

1. Run `git status` and `git diff` to understand changes
2. Run `pnpm type-check` to verify code quality
3. Create descriptive commit message focusing on user-facing impact and technical reasoning
4. Use format: `type: description` with proper context
5. Include co-authorship footer as specified in CLAUDE.md
6. Update relevant documentation (TODO.md, CURRENT_STATE.md) if needed

Arguments: `$ARGUMENTS` (optional commit message prefix)