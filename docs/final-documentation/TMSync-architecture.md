# TMSync - Architecture Documentation

Generated on: 2025-07-07 21:40:41

## ADR-0006: Universal Per-Service Scrobbling Logic

- **Type**: ADR
- **Status**: Accepted
- **Created**: 2025-07-07 14:35:34
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
Original approach used complex authority logic to resolve service state conflicts. User feedback showed this was over-engineered and confusing. Need simple, predictable scrobbling behavior that works the same way for all services.

### Decision
Implement universal scrobbling rules applied independently per service: Any status ≠ 'watching' becomes 'watching' when scrobbling episode > current episode. Episode = total episodes becomes 'completed' + increment rewatch count. AniList special case: if initial status was 'completed' and episode = total episodes → 'rewatching'. No cross-service authority or conflict resolution.

### Decision Drivers
- Eliminate complex authority logic
- Provide predictable behavior
- Service independence philosophy
- User preference for simplicity
- Consistent rules across all services

### Considered Options
- Universal scrobbling logic
- Authority-based conflict resolution
- Per-service custom logic
- User-selected primary service

### Consequences
**Positive**: ['Predictable behavior for users', 'Simple implementation', 'True service independence', 'No complex state conflicts', 'Easy to understand and test']
**Negative**: ['No intelligent conflict resolution', 'Potential user confusion with different service states']
**Neutral**: ['Shifts complexity from technical to UX transparency']

### Linked Requirements
- REQ-0007-FUNC-00: Per-Service Independent Scrobbling Logic

---

## ADR-0007: Enhanced Service Independence with Real-World API Handling

- **Type**: ADR
- **Status**: Accepted
- **Created**: 2025-07-07 14:35:34
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
Initial service independence concept needed enhancement based on real-world API limitations encountered during prototyping, including rate limits (429 errors), timeouts, and auth failures. Need robust architecture that handles these gracefully while maintaining service isolation.

### Decision
Implement enhanced service independence with parallel loading, intelligent timeout handling ('Taking longer than usual' after 10-15s), auto-retry for rate limits with generous windows, manual intervention for user actions during service issues, and minimal status text for service problems. Each service maintains complete isolation with its own error handling.

### Decision Drivers
- Real-world API limitations (429 rate limits)
- User experience during service issues
- Service isolation requirements
- Practical timeout handling
- Manual control preference

### Considered Options
- Enhanced independence with smart handling
- Simple independence with basic error handling
- Unified error handling across services
- No special handling for API limitations

### Consequences
**Positive**: ['Robust handling of real-world API issues', 'Excellent UX during service problems', 'Complete service isolation maintained', 'Smart auto-retry for recoverable issues', 'User control over problem resolution']
**Negative**: ['More complex implementation', 'Additional state management per service']
**Neutral**: ['Prepares for production API limitations']

### Linked Requirements
- REQ-0002-NFUNC-00: Enhanced Service Independence Architecture

---

## ADR-0008: Accurate Service Rating Conversion with Scale Detection

- **Type**: ADR
- **Status**: Accepted
- **Created**: 2025-07-07 14:35:34
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
Initial rating conversion logic was based on incorrect service limitations. Research revealed Trakt and MAL only accept integers (1-10), while AniList supports user-configurable scales (10-point integer, 10-point 0.5 step, or 100-point integer). Need accurate conversion that respects actual service constraints.

### Decision
Implement 0.1 step precision input (0.0-10.0) with accurate conversion: Trakt/MAL round to nearest integer, AniList converts based on user's API preference setting. Detect AniList scale from user preferences. Use standard rounding for integers (6.5 → 7). Show conversion preview with actual values.

### Decision Drivers
- Accurate service limitation research
- AniList user preference flexibility
- Precision vs compatibility balance
- Clear user understanding of conversions
- Future-proof design for service changes

### Considered Options
- Accurate service conversion with detection
- Restrict input to lowest common denominator
- Service-specific input interfaces
- No conversion preview

### Consequences
**Positive**: ['Accurate service compatibility', 'Respects user preferences', 'Future-proof design', 'Clear conversion transparency']
**Negative**: ['Requires AniList preference detection', 'More complex conversion logic']
**Neutral**: ['Maintains unified input convenience']

### Linked Requirements
- REQ-0009-FUNC-00: Unified Rating Input with Accurate Service Conversion

---

## ADR-0001: Per-Service Independence over Unified State Architecture

- **Type**: ADR
- **Status**: Accepted
- **Created**: 2025-07-07 10:00:23
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
TMSync currently uses a unified state approach where all services share common data structures and states. This creates UX confusion when services have different states and technical complexity in reconciling service differences. Users don't understand why their ratings or progress differ between services.

### Decision
Adopt per-service independence architecture where each service (Trakt, AniList, MAL) maintains completely separate state with no attempt to unify or reconcile differences. Services operate in parallel with independent failure modes.

### Decision Drivers
- User confusion from hidden service differences
- Technical complexity of state reconciliation
- Service-specific business rules that don't align
- Cascading failure issues when services are down
- Need for transparent service behavior

### Considered Options
- Unified state with reconciliation
- Per-service independence
- Hybrid approach with primary service

### Consequences
**Positive**: ['Clear service transparency', 'No cascading failures', 'Service-specific optimizations possible', 'Simpler error handling', 'True service behavior representation']
**Negative**: ['More complex UI state management', 'Potential user confusion about different states', 'More API calls and data storage']
**Neutral**: ['Shift from technical complexity to UX design challenges']

### Linked Requirements
- REQ-0001-NFUNC-00: Service Independence Architecture
- REQ-0005-FUNC-00: Service State Conflict Resolution

---

## ADR-0002: Most Advanced State Authority for Scrobbling

- **Type**: ADR
- **Status**: Superseded
- **Created**: 2025-07-07 10:00:23
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
When services have conflicting states (e.g., MAL shows episode 8, AniList shows episode 5), the system needs a consistent way to determine scrobbling behavior. The current unified approach masks these conflicts and leads to unpredictable behavior.

### Decision
Use the service with the most advanced state (highest episode progress) as the authority for scrobbling decisions. Special case: 'Completed + partial episodes' should be treated as 'watching' to handle rewatch scenarios.

### Decision Drivers
- Need for consistent scrobbling behavior
- Trust the most accurate/recent data
- Handle rewatch scenarios appropriately
- Prevent episode regression
- Maintain user expectations

### Considered Options
- Most advanced state authority
- User-selected primary service
- Averaging or majority rule
- Always prompt user for conflicts

### Consequences
**Positive**: ['Consistent and predictable behavior', 'Respects most accurate data', 'Handles edge cases well', 'No user interruption needed']
**Negative**: ["May not match user's preferred service", 'Could ignore deliberate service differences']
**Neutral**: ['Transparent to users through clear UI indication']

### Linked Requirements
- REQ-0005-FUNC-00: Service State Conflict Resolution

---

## ADR-0003: 10-Point Unified Rating Input with Service-Specific Conversion

- **Type**: ADR
- **Status**: Superseded
- **Created**: 2025-07-07 10:00:23
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
Each service uses different rating scales (Trakt: 0.5-10 in 0.5 increments, AniList: 1-100, MAL: 1-10 integers) creating user confusion about how ratings translate between services. Users want convenience of single input while understanding service differences.

### Decision
Implement unified 10-point decimal input (0.0-10.0) with transparent conversion to each service's native format. Show conversion preview before submission. Conversion rules: Trakt (round to nearest 0.5), AniList (multiply by 10), MAL (round to nearest integer).

### Decision Drivers
- User convenience for input
- Service format transparency
- Familiar 10-point scale
- Minimize rating conversion confusion
- Respect service-specific limitations

### Considered Options
- 10-point unified input
- Service-specific input tabs
- Lowest common denominator (integers only)
- Service-agnostic percentage input

### Consequences
**Positive**: ['Single input point convenience', 'Clear conversion transparency', 'Familiar rating scale', 'Service differences respected']
**Negative**: ['Conversion may not be perfect', 'Some precision loss in conversion', 'Additional UI complexity for preview']
**Neutral**: ['Maintains service independence philosophy']

### Linked Requirements
- REQ-0001-FUNC-00: Per-Service Rating Display
- REQ-0002-FUNC-00: Unified Rating Input with Service Conversion

---

## ADR-0004: Full Service-Specific Rewatch Logic Implementation

- **Type**: ADR
- **Status**: Superseded
- **Created**: 2025-07-07 10:00:23
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
AniList and MAL have complex rewatch logic with episode progression rules and status transitions. Current implementation simplifies this logic leading to incorrect episode counting and status management during rewatches.

### Decision
Implement full service-specific rewatch logic from scratch without simplification. AniList: full episode progression with COMPLETED → REWATCHING transitions. MAL: same logic but without REWATCHING status due to service limitations.

### Decision Drivers
- Accurate episode tracking
- Prevent double-counting episodes
- Service-specific business rules
- User expectations for rewatch behavior
- Data integrity across services

### Considered Options
- Full service-specific logic
- Simplified common denominator
- User-prompted rewatch handling
- Disable rewatch support

### Consequences
**Positive**: ['Accurate episode tracking', 'Proper rewatch handling', 'Service compliance', 'User trust in data accuracy']
**Negative**: ['Complex implementation', 'Service-specific testing required', 'Potential edge cases']
**Neutral**: ['Aligns with per-service independence philosophy']

### Linked Requirements
- REQ-0006-FUNC-00: Per-Service Scrobbling Logic

---

## ADR-0005: Tabbed Comment Interface with Write-to-All Option

- **Type**: ADR
- **Status**: Accepted
- **Created**: 2025-07-07 10:00:23
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
Services have different comment paradigms (Trakt: multiple comments with spoiler flags, AniList/MAL: single notes). Current unified approach doesn't respect these differences and creates validation conflicts.

### Decision
Implement tabbed interface with service-specific comment tabs plus a 'Write to All' tab with service selection checkboxes. Dynamic validation changes based on selected services (5-word minimum for Trakt, spoiler flags for Trakt only).

### Decision Drivers
- Service comment paradigm differences
- User convenience for bulk commenting
- Service-specific validation requirements
- Comment history preservation
- Flexible service selection

### Considered Options
- Tabbed interface with write-to-all
- Service-specific input only
- Unified comment with service flags
- Modal-based comment management

### Consequences
**Positive**: ['Clear service separation', 'Flexible comment management', 'Service-specific validation', 'User choice in distribution']
**Negative**: ['More complex UI', 'Potential user confusion about tabs', 'Validation complexity']
**Neutral**: ['Maintains service independence while providing convenience']

### Linked Requirements
- REQ-0003-FUNC-00: Service-Specific Comment Tabs
- REQ-0004-FUNC-00: Write to All Services with Selection

---

