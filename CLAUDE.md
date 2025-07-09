# TMSync Development Guide

## Quick Commands

**Package Manager**: `pnpm` for everything

**Development**:

-   `pnpm dev` - Development build with watch
-   `pnpm build` - Production build
-   `pnpm clean` - Clean dist directory

**Quality Checks** (Run before committing):

-   `pnpm check-all` - Run all checks
-   `pnpm fix-all` - Auto-fix everything possible
-   `pnpm type-check` - TypeScript validation
-   `pnpm lint` - ESLint with auto-fix
-   `pnpm format` - Prettier formatting

## Multi-Service Architecture

**Core Philosophy**: Per-service independence with unified input options

**Key Principles**:

-   Respect service differences, don't force unification
-   Show actual service states transparently
-   Provide unified input when convenient
-   Let users understand what each service will do

**Service Authority for Scrobbling**:

1. Trust the most advanced state (highest episode progress)
2. "Completed + partial episodes" = treat as "watching"
3. Each service follows its own rewatch logic

**Implementation Guidelines**:

-   Use service-agnostic types for handlers
-   Convert native service types to service-agnostic types
-   Handle service failures independently

## Working with Lifecycle MCP

**Current Workflow**: TMSync uses lifecycle MCP for formal project management

**Project Status**: `what's the project status?` - Shows requirements, tasks, completion
**Task Management**: Pick tasks with `let's work on [task]` or `let's do [requirement]`
**Documentation**: Live project state maintained in lifecycle.db automatically

**Implementation Process**:

1. Select task from project status
2. Implement with multiple approaches when choices exist
3. Test before moving to next task
4. Automatically update ADRs for architectural decisions
5. Update lifecycle system as work progresses

**Documentation Exports**: `docs/final-documentation/` contains static exports for external sharing only - NOT part of workflow, just a nice addition for stakeholders

## Service-Specific Rules

**Trakt**: Simple scrobbling, no complex logic, multiple comments
**AniList**: Episode progression rewatch logic, single notes, COMPLETED → REWATCHING
**MAL**: Same as AniList but no REWATCHING status

**Rating Conversion** (from 10-point input):

-   Trakt: Round to nearest 0.5
-   AniList: Multiply by 10 (7.5 → 75)
-   MAL: Round to nearest integer

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

**Lifecycle Status**: Use `what's the project status?` - Shows current requirements, tasks, and completion
**Quality Checks**: `pnpm check-all` - Run all lints and tests before committing
