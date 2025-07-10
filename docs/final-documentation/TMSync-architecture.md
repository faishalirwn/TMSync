# TMSync - Architecture Documentation

Generated on: 2025-07-09 16:06:03

## ADR-0017: Use completedRef Guard to Prevent Video Event Race Conditions

- **Type**: ADR
- **Status**: Implemented
- **Created**: 2025-07-09 08:55:15
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: Claude

### Context
The fundamental issue is that video timeupdate events fire continuously regardless of scrobble completion state. This causes sendScrobbleStart to be called even after episode completion, creating race conditions with threshold processing. The problem is at the DOM/video level, not the service architecture level.

### Decision
Implement completedRef.current guard in processThrottledTimeUpdate to prevent any scrobble operations after completion. This stops the video event handler from doing work after the scrobble is complete, addressing the race condition at its source.

### Decision Drivers
- Video events are the root cause, not service logic
- Simple guard is more reliable than complex abstractions
- Performance - avoid unnecessary processing after completion
- Maintainability - clear single point of control

### Considered Options
- Complex service architecture abstractions
- Video event handler guards using completedRef
- Disconnect video event listeners after completion

### Consequences
**Positive**: ['Eliminates race conditions at the source', 'Simple and maintainable solution', 'Prevents unnecessary API calls', 'Clear completion state management']
**Negative**: ['Requires careful management of completedRef state', 'Must ensure completedRef is reset properly on new episodes']
**Neutral**: ['Addresses root cause rather than symptoms', 'Simpler than service architecture changes']

### Linked Requirements
- REQ-0002-TECH-00: Fix Video TimeUpdate Race Condition in Scrobbling

---

## ADR-0016: Revert Enhanced Service Independence Architecture

- **Type**: ADR
- **Status**: Implemented
- **Created**: 2025-07-09 08:52:18
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: Claude

### Context
After implementing a comprehensive enhanced service independence system with capability-based thresholds, service-defined stop behaviors, and generic handlers, the user requested to revert all architectural changes and keep only the race condition fix. The enhanced system included ServiceCapabilityConfig interfaces, service-defined stop behaviors, and generic progress threshold handlers, but was deemed too complex for the current needs.

### Decision
Revert all architectural enhancements and maintain the original coupled frontend threshold approach with only the race condition fix preserved. Services will continue to be triggered by a unified 80% threshold in the frontend, maintaining the existing simple architecture.

### Decision Drivers
- User preference for simpler architecture
- Avoid over-engineering for current requirements
- Maintain existing proven functionality
- Focus on essential bug fixes rather than architectural changes

### Considered Options
- Keep enhanced service independence architecture
- Revert to original architecture with race condition fix
- Partial revert keeping only capability enhancements

### Consequences
**Positive**: ['Simpler codebase maintenance', 'Reduced complexity', 'Preserved essential race condition fix', 'Faster development cycle']
**Negative**: ['Services remain coupled through frontend threshold', 'Less scalable for future service additions', 'Missed opportunity for true service independence']
**Neutral**: ['Returns to original well-tested architecture', 'Race condition fix addresses immediate user need']

### Linked Requirements
- REQ-0007-FUNC-00: Per-Service Independent Scrobbling Logic

---

## ADR-0015: Enhanced Capability-Based Service Independence

- **Type**: ADR
- **Status**: Implemented
- **Created**: 2025-07-09 07:39:51
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: MCP User

### Context
Current scrobbling implementation couples services through unified 80% threshold in frontend that triggers both Trakt stopScrobble() and AniList addToHistory() operations. The existing capability system uses simple boolean flags (supportsRealTimeScrobbling, supportsProgressTracking) which don't capture service-specific trigger conditions. This prevents true service independence where each service should define its own thresholds and trigger logic.

### Decision
Enhance the existing capability system to support service-defined thresholds and trigger operations:

1. **Enhanced ServiceCapabilities Interface**:
   - Extend capability definitions to include threshold and triggerOperation
   - Services declare their own trigger conditions (e.g., Trakt: 80%, AniList: 90%)
   - Services specify which method to call (stopScrobble vs addToHistory)

2. **Generic Progress Handler**:
   - Create handleProgressThreshold() that processes all services generically
   - Services autonomously decide when to trigger based on their capabilities
   - Handler uses dynamic method calls based on service configuration

3. **Frontend Decoupling**:
   - Frontend sends progress updates without threshold decisions
   - Remove hardcoded TRAKT_SCROBBLE_COMPLETION_THRESHOLD
   - Services become active participants in their own logic

4. **Maintain Existing Abstraction**:
   - Preserve service-agnostic handler patterns
   - Keep parallel processing with Promise.allSettled
   - Maintain TrackerService interface consistency

### Decision Drivers
- Service independence principle
- Abstraction preservation
- Existing capability system enhancement
- Scalability for future services

### Considered Options
- Service-specific handlers
- Event-driven architecture
- Service-aware frontend
- State machine approach

### Consequences
**Positive**: ['True service independence', 'Maintains abstraction patterns', 'Service-defined thresholds', 'Scalable to new services', 'Generic handler logic']
**Negative**: ['More complex capability definitions', 'Dynamic method calls', 'Capability interface changes']
**Neutral**: ['Existing parallel processing maintained', 'TrackerService interface preserved']

### Linked Requirements
- REQ-0007-FUNC-00: Per-Service Independent Scrobbling Logic

---

## ADR-0014: Service-Specific Handlers for Independent Scrobbling

- **Type**: ADR
- **Status**: Superseded
- **Created**: 2025-07-09 07:18:19
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: MCP User

### Context
Current scrobbling implementation has Trakt and AniList services coupled through a unified 80% threshold in handleScrobbleStop(). When frontend reaches 80% progress, both services are triggered simultaneously - Trakt executes stopScrobble() and AniList executes addToHistory(). This prevents independent service operation and forces both services to follow the same trigger logic.

### Decision
Implement service-specific handlers that decouple real-time scrobbling from progress tracking:

1. Create separate handlers:
   - handleTraktScrobbleStop() - Only processes real-time scrobbling services
   - handleAnilistAddToHistory() - Only processes progress tracking services
   - Keep existing handleScrobbleStop() for backward compatibility

2. Allow per-service threshold configuration:
   - Trakt: 80% threshold for scrobble stop
   - AniList: Configurable threshold for add to history (could be different)

3. Frontend calls appropriate handlers based on service capabilities and user preferences

4. Maintain existing parallel processing architecture using Promise.allSettled

### Decision Drivers
- Service independence principle from CLAUDE.md
- Existing parallel processing architecture
- Clean separation of concerns
- Backward compatibility during transition

### Considered Options
- Per-service threshold configuration
- Service-specific handlers
- Event-based decoupling
- Capability-based independent processing

### Consequences
**Positive**: ['Independent service operation', 'Configurable per-service thresholds', 'Clean separation of real-time vs progress tracking', 'Maintains existing parallel processing']
**Negative**: ['Additional handler complexity', 'Potential code duplication', 'Frontend needs to know which handlers to call']
**Neutral**: ['Backward compatibility maintained during transition']

### Linked Requirements
- REQ-0007-FUNC-00: Per-Service Independent Scrobbling Logic

---

## ADR-0013: Comprehensive Parallel Service Processing Implementation

- **Type**: ADR
- **Status**: Implemented
- **Created**: 2025-07-08 09:36:54
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: Development Team

### Context
Extended parallel processing beyond scrobbling to cover ALL service operations in the system. Sequential processing violations found in rating operations (8 functions) and comment operations (3 functions) that also violated service independence.

### Decision
Implement parallel Promise.allSettled execution for all multi-service operations: scrobbling (start/pause/stop), rating (rate/unrate for movie/show/season/episode), and comments (get/post/delete). Each operation type maintains individual service error handling.

### Decision Drivers
- Complete REQ-0002-NFUNC-00 compliance
- Comprehensive service independence
- Consistent architectural patterns
- Performance optimization across all features
- User experience consistency

### Considered Options
- Fix only scrobbling operations
- Gradual rollout by feature area
- Comprehensive parallel implementation
- Hybrid approaches per operation type

### Consequences
**Positive**: ['True service independence achieved system-wide', 'Consistent performance across all features', 'No blocking between services anywhere', 'Complete architectural compliance', 'Better fault tolerance universally']
**Negative**: ['More complex error aggregation patterns', 'Increased implementation scope']
**Neutral**: ['14 total operations converted to parallel', 'Consistent Promise.allSettled pattern throughout']

### Linked Requirements
- REQ-0002-NFUNC-00: Enhanced Service Independence Architecture

---

## ADR-0012: Parallel Service Processing for Scrobble Operations

- **Type**: ADR
- **Status**: Implemented
- **Created**: 2025-07-08 09:19:28
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: Development Team

### Context
Sequential service processing violated REQ-0002-NFUNC-00 P0 requirement for service independence. Primary service (Trakt) would block all other services, and slow/failing services could impact overall performance.

### Decision
Convert all scrobble operations (start/pause/stop) from sequential for-loops to parallel Promise.allSettled execution. All enabled services now run simultaneously with individual error handling.

### Decision Drivers
- Service independence requirement (P0)
- Performance optimization
- Fault tolerance
- User experience improvement
- Architectural consistency

### Considered Options
- Keep sequential processing
- Hybrid approach (parallel within categories)
- Full parallel execution
- Service prioritization with timeouts

### Consequences
**Positive**: ['True service independence achieved', 'No blocking between services', 'Better fault tolerance', 'Improved overall performance', 'Consistent with architecture principles']
**Negative**: ['Slightly more complex error aggregation', 'Loss of service execution order']
**Neutral**: ['Uses Promise.allSettled for proper error isolation', 'Maintains individual service error handling']

### Linked Requirements
- REQ-0002-NFUNC-00: Enhanced Service Independence Architecture

---

## ADR-0011: Scrobble Operation Deduplication and Race Condition Prevention

- **Type**: ADR
- **Status**: Accepted
- **Created**: 2025-07-08 09:09:18
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: Development Team

### Context
Discovered cascading start-stop loops caused by 2-second throttling delays and lack of start operation deduplication. Multiple 409 conflicts led to retry loops, and async timeupdate events continued after stop completion.

### Decision
Extend scrobbleOperationManager to handle all operations (start/stop/pause) with unified deduplication, add completion state flag to prevent operations after successful stop, and treat 409 conflicts as success since content is already scrobbled.

### Decision Drivers
- Prevent start-after-stop race conditions
- Eliminate duplicate scrobble operations
- Handle Trakt 409 conflicts gracefully
- Maintain operation atomicity
- Unified operation management

### Considered Options
- Frontend-only throttling
- Backend-only deduplication
- Status-based prevention
- Operation manager extension
- Complete operation blocking

### Consequences
**Positive**: ['Eliminates start-stop cascading loops', 'Unified operation deduplication', 'Proper 409 conflict handling', 'Atomic completion state', 'Better error resilience']
**Negative**: ['Additional state management complexity', 'More restrictive operation blocking']
**Neutral**: ['Operation manager handles all scrobble types', 'Completion state resets on undo']

### Linked Requirements
- REQ-0001-TECH-00: Handle Trakt 409 Duplicate Scrobble Conflicts

---

## ADR-0010: Auto-Scrobbling Disable Pattern After Undo Operations

- **Type**: ADR
- **Status**: Accepted
- **Created**: 2025-07-07 16:14:58
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: Development Team

### Context
Users experienced undo→auto-scrobble loops when undoing a scrobble while video remained above 80% threshold. After undo clears historyIdRef, auto-scrobble logic would immediately re-trigger.

### Decision
Implement autoScrobblingDisabledRef flag pattern to disable ALL auto-scrobbling actions after undo until manual user action re-enables it.

### Decision Drivers
- Prevent undo→auto-scrobble infinite loops
- Maintain user control after undo actions
- Simple flag-based solution over complex state tracking
- Consistent behavior across all auto-scrobble triggers

### Considered Options
- Complex state tracking with timestamps
- Per-action disable flags
- Global auto-scrobble disable flag
- Video position-based prevention

### Consequences
**Positive**: ['Prevents undo loops completely', 'Simple implementation with single flag', 'Re-enables on manual action naturally', 'Blocks all auto-scrobble vectors (play/pause/ended/completion)']
**Negative**: ['Requires manual action to re-enable', 'Additional state management complexity']
**Neutral**: ['Flag resets on successful scrobble completion', 'Session-only behavior (no persistence)']

### Linked Requirements
- REQ-0002-INTF-00: Global Scrobbling Toggle

---

## ADR-0009: Remove Start and Rewatch Prompts in Favor of Global Toggle

- **Type**: ADR
- **Status**: Accepted
- **Created**: 2025-07-07 15:31:09
- **Updated**: CURRENT_TIMESTAMP

- **Authors**: TMSync Team

### Context
Original design included StartWatchPrompt and RewatchPrompt components to prevent accidental scrobbling. However, during global toggle implementation, user feedback indicated these prompts were annoying barriers that disrupted the user experience. The global toggle provides sufficient control over automatic scrobbling without requiring confirmation prompts.

### Decision
Remove all confirmation prompts (StartWatchPrompt, RewatchPrompt) entirely and rely solely on the global auto-scrobbling toggle for user control. Users go directly to the main scrobbling UI without any confirmation barriers. The global toggle serves as the primary protection against unwanted automatic scrobbling.

### Decision Drivers
- User preference for streamlined experience
- Global toggle provides sufficient control
- Prompts created friction without adding value
- Simpler codebase and user flow
- Immediate access to manual scrobbling controls

### Considered Options
- Remove prompts entirely
- Keep prompts but bypass when toggle is off
- Make prompts optional via settings
- Reduce prompt frequency

### Consequences
**Positive**: ['Streamlined user experience', 'Immediate access to scrobbling controls', 'Simpler codebase maintenance', 'No friction for power users']
**Negative**: ['No protection against accidental scrobbling for new users', 'Potential for unexpected auto-scrobbling behavior', 'Need to handle edge cases like undo loops']
**Neutral**: ['Shifts control paradigm from confirmation to prevention']

### Linked Requirements
- REQ-0002-INTF-00: Global Scrobbling Toggle

---

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

