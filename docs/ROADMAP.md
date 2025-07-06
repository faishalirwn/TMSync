# TMSync Multi-Service Redesign Roadmap

This roadmap defines the transformation from unified service approach to per-service independence with unified input options. Tasks can be completed in any order unless dependencies are noted.

**Quick Start**: Say "let's do [specific todo]" and reference `docs/DESIGN_DECISIONS.md` for detailed technical context.

## Philosophy

**Per-Service Independence with Unified Input Options**:

-   Respect service differences instead of forcing unification
-   Show actual service states transparently
-   Provide optional unified input when convenient
-   Let users understand what each service will do

## Rating System

### Per-Service Display

-   [ ] **Display current ratings per service** with native scales

    -   Requirements: Show `Trakt: 8/10`, `AniList: 85/100`, `MAL: 8/10`
    -   Edge cases: Handle missing ratings, different service availability
    -   Success: User sees exactly what each service currently has

-   [ ] **Implement unified 10-point input** with transparent conversion

    -   Requirements: Single decimal input (0.0-10.0), convert to service formats
    -   Conversion: Trakt (nearest 0.5), AniList (�10), MAL (nearest int)
    -   Edge cases: Handle conversion edge cases, service-specific limits
    -   Success: User can input 7.3 and it converts appropriately per service

-   [ ] **Add rating conflict resolution UI**
    -   Requirements: Show when services have different ratings
    -   Edge cases: One service has rating, others don't
    -   Success: User understands rating differences across services

## Comment System

### Tabbed Interface

-   [ ] **Create service-specific comment tabs**

    -   Requirements: Individual tabs for each service (Trakt comments, AniList notes)
    -   Edge cases: Handle services with no comments/notes
    -   Success: User sees clear separation between service comment paradigms

-   [ ] **Implement "Write to All" tab** with service selection

    -   Requirements: Unified input with checkboxes for service selection
    -   Edge cases: No services selected, all services disabled
    -   Success: User can write once and send to selected services

-   [ ] **Add dynamic validation** based on selected services

    -   Requirements: Real-time validation changes when services toggled
    -   Rules: 5-word minimum if Trakt selected, no minimum for AniList/MAL only
    -   Edge cases: Mid-typing service toggle, spoiler flags for Trakt only
    -   Success: Validation feedback changes immediately with service selection

-   [ ] **Implement per-service comment submission**

    -   Requirements: Submit to ALL selected services, not just first successful
    -   Edge cases: Partial failures, auth issues, service timeouts
    -   Success: Each service gets the comment independently

-   [ ] **Add comment failure handling**
    -   Requirements: Show per-service success/failure status
    -   Edge cases: Failed services stay checked for retry
    -   Success: User can retry failed services without re-entering text

## Scrobbling System

### State Reconciliation

-   [ ] **Implement service state conflict resolution**

    -   Requirements: Trust most advanced state for scrobbling logic
    -   Algorithm: Find highest episode progress, use as authority
    -   Edge cases: "Completed + partial episodes" = treat as "watching"
    -   Success: Example - MAL ep 8, AniList ep 5 � MAL is authority

-   [ ] **Add transparent service state display**

    -   Requirements: Show all service states, highlight most advanced
    -   Edge cases: Services with different episode counts, missing data
    -   Success: User sees all states and understands which is most advanced

-   [ ] **Implement per-service scrobbling logic**
    -   Requirements: Each service follows its own scrobbling rules
    -   Trakt: Simple scrobbling, no complex logic
    -   AniList: Episode progression rules, rewatch logic
    -   MAL: Same as AniList but no REWATCHING status
    -   Dependencies: Requires state conflict resolution
    -   Success: Services scrobble according to their own rules

### Scrobbling Controls

-   [ ] **Add global scrobbling toggle**

    -   Requirements: Single toggle in service badge area
    -   Authority: Options page > Auth > Global toggle > Service errors
    -   Edge cases: Some services disabled, partial auth failures
    -   Success: Single toggle controls all enabled services

-   [ ] **Implement AniList rewatch logic**

    -   Requirements: Full rewatch logic from start (don't simplify)
    -   Rules: Episode progression, COMPLETED � REWATCHING prompts
    -   Edge cases: Can't determine episode order, API errors
    -   Success: Prevents double-counting episodes, correct progress tracking

-   [ ] **Add MAL rewatch logic**
    -   Requirements: Same as AniList but no REWATCHING status
    -   Edge cases: Status limitations, rewatch detection
    -   Dependencies: Requires AniList rewatch logic
    -   Success: Consistent rewatch behavior across anime services

## Service State Management

### Multi-Service State

-   [ ] **Implement service state independence**

    -   Requirements: Each service maintains its own complete state
    -   Edge cases: Conflicting states, partial data
    -   Success: No attempt to reconcile different service states

-   [ ] **Add service health monitoring**

    -   Requirements: Track service availability, auth status, error states
    -   Edge cases: Service timeouts, API changes, auth expiration
    -   Success: Clear service status indicators

-   [ ] **Implement parallel data loading**
    -   Requirements: Load all services simultaneously, show partial results
    -   Edge cases: Slow services, timeouts, failures
    -   Success: Don't wait for slowest service, show data as it loads

## UI/UX Improvements

### Service Transparency

-   [ ] **Add service badge enhancements**

    -   Requirements: Show service-specific status, capabilities
    -   Edge cases: Disabled services, auth failures, mixed states
    -   Success: User understands what each service can/will do

-   [ ] **Implement service-specific error display**

    -   Requirements: Show individual service errors, not generic failures
    -   Edge cases: Multiple simultaneous errors, retry scenarios
    -   Success: User knows exactly which service failed and why

-   [ ] **Add service capability indicators**
    -   Requirements: Show what each service supports (scrobbling, comments, etc.)
    -   Edge cases: Service capabilities change, temporary limitations
    -   Success: User understands service differences and capabilities

## Performance & Error Handling

### Error Resilience

-   [ ] **Implement basic retry logic**

    -   Requirements: Simple retry on auth failures, no complex queuing
    -   Edge cases: Retry exhaustion, persistent failures
    -   Success: Basic resilience without overcomplicating

-   [ ] **Add graceful degradation**

    -   Requirements: Individual service failures don't affect others
    -   Edge cases: All services fail, partial functionality
    -   Success: Extension works with whatever services are available

-   [ ] **Implement service-specific error handling**
    -   Requirements: Handle different error formats (HTTP, GraphQL, etc.)
    -   Edge cases: Unknown errors, API changes, malformed responses
    -   Success: Appropriate error messages per service type

### Performance Optimization

-   [ ] **Add caching strategy** (Future Phase)

    -   Requirements: TBD during implementation
    -   Note: Deferred to later phases, focus on core functionality first

-   [ ] **Implement UI space optimization** (Future Phase)
    -   Requirements: Efficient layout for multiple service states
    -   Note: Optimize after core functionality is complete

## Migration & Cleanup

### Code Structure

-   [ ] **Remove unified approach dependencies**

    -   Requirements: Clean up code that assumes unified state
    -   Edge cases: Backward compatibility, feature flags
    -   Success: Clean codebase with per-service architecture

-   [ ] **Update type definitions**
    -   Requirements: Ensure types reflect per-service approach
    -   Dependencies: Most implementation tasks
    -   Success: Type safety for per-service architecture

## Out of Scope

**Not Included in This Redesign**:

-   Complex state reconciliation between services
-   Advanced retry queues or persistence
-   Per-service rating overrides
-   Episode mapping conflicts (future phase)
-   Advanced caching strategies (future phase)

## Success Criteria

**Overall Success**: User can interact with services individually or together, with complete transparency about what each service has and what will happen with each action.

**Reference**: See `docs/DESIGN_DECISIONS.md` for detailed technical context, edge cases, and implementation decisions.
