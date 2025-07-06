# TMSync Development Guide

## Quick Commands

**Package Manager**: `pnpm` for everything

**Development**:
- `pnpm dev` - Development build with watch
- `pnpm build` - Production build
- `pnpm clean` - Clean dist directory

**Quality Checks** (Run before committing):
- `pnpm check-all` - Run all checks
- `pnpm fix-all` - Auto-fix everything possible
- `pnpm type-check` - TypeScript validation
- `pnpm lint` - ESLint with auto-fix
- `pnpm format` - Prettier formatting

## Multi-Service Architecture

**Core Philosophy**: Per-service independence with unified input options

**Key Principles**:
- Respect service differences, don't force unification
- Show actual service states transparently
- Provide unified input when convenient
- Let users understand what each service will do

**Service Authority for Scrobbling**:
1. Trust the most advanced state (highest episode progress)
2. "Completed + partial episodes" = treat as "watching"
3. Each service follows its own rewatch logic

**Implementation Guidelines**:
- Use service-agnostic types for handlers
- Convert native service types to service-agnostic types
- Handle service failures independently
- Test with `npx tsx src/test-services.ts`

## Working with the Roadmap

**Workflow**:
1. Check `docs/ROADMAP.md` for available todos
2. Say "let's do [specific todo]"
3. Reference `docs/DESIGN_DECISIONS.md` for technical context
4. Update QA docs during any planning sessions

**Todo Format**: Each roadmap item includes:
- Specific requirements
- Edge cases to handle
- Success criteria
- Dependencies if needed

## Service-Specific Rules

**Trakt**: Simple scrobbling, no complex logic, multiple comments
**AniList**: Episode progression rewatch logic, single notes, COMPLETED → REWATCHING
**MAL**: Same as AniList but no REWATCHING status

**Rating Conversion** (from 10-point input):
- Trakt: Round to nearest 0.5
- AniList: Multiply by 10 (7.5 → 75)
- MAL: Round to nearest integer

## Common Patterns

**Service State Display**: Show all service states, highlight most advanced
**Error Handling**: Per-service errors, no global failures
**Data Loading**: Parallel loading, show partial results
**Validation**: Apply most restrictive rules from selected services

## Development Notes

**Commit Strategy**: Complete features only, descriptive messages focusing on "why"
**Testing**: Run quality checks before committing
**Architecture**: Follow per-service independence, avoid unified state assumptions

## File Structure

**Services**: `src/services/` - Service implementations
**Types**: `src/types/services.ts` - TrackerService interface
**Handlers**: `src/background/handlers/` - Message handlers
**Components**: `src/content-scripts/main/components/` - UI components

## Reference

**Roadmap**: `docs/ROADMAP.md` - Current todos and requirements
**Technical Context**: `docs/DESIGN_DECISIONS.md` - Detailed Q&A and edge cases
**Service Test**: `npx tsx src/test-services.ts` - Multi-service functionality testing