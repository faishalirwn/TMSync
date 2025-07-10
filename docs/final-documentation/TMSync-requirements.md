# TMSync - Requirements Documentation

Generated on: 2025-07-09 16:06:03

## FUNC Requirements

### REQ-0001-FUNC-00: Per-Service Rating Display

- **Status**: Approved
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 09:43:48
- **Updated**: 2025-07-07 09:45:59

**Current State**: Unified rating display with single value

**Desired State**: Individual service ratings displayed with native scales (Trakt: 8/10, AniList: 85/100, MAL: 8/10)

**Business Value**: Users see exactly what each service currently has, eliminating confusion about rating differences

**Functional Requirements**:
- Display current ratings per service with native scales
- Handle missing ratings gracefully
- Show different service availability states

**Acceptance Criteria**:
- User sees service-specific ratings in native format
- Missing ratings display appropriately
- Service availability is clearly indicated

---

### REQ-0002-FUNC-00: Unified Rating Input with Service Conversion

- **Status**: Deprecated
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 09:43:48
- **Updated**: 2025-07-07 13:49:00

**Current State**: Single unified input without transparent conversion

**Desired State**: 10-point decimal input (0.0-10.0) with transparent conversion to service formats

**Business Value**: Users can input ratings once while understanding how they convert to each service

**Functional Requirements**:
- Accept decimal input from 0.0-10.0
- Convert to service formats: Trakt (nearest 0.5), AniList (×10), MAL (nearest int)
- Show conversion preview to users

**Acceptance Criteria**:
- User can input 7.3 and see how it converts per service
- Conversion handles edge cases correctly
- Service-specific limits are enforced

---

### REQ-0003-FUNC-00: Service-Specific Comment Tabs

- **Status**: Approved
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 09:43:48
- **Updated**: 2025-07-07 09:46:00

**Current State**: Unified comment interface

**Desired State**: Tabbed interface with individual tabs for each service (Trakt comments, AniList notes)

**Business Value**: Users understand service comment paradigms and can manage comments per service

**Functional Requirements**:
- Create tabs for each service
- Handle services with no comments/notes
- Show service-specific comment history

**Acceptance Criteria**:
- User sees clear separation between service comment types
- Services without comments handled gracefully
- Comment history preserved per service

---

### REQ-0004-FUNC-00: Write to All Services with Selection

- **Status**: Approved
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 09:43:48
- **Updated**: 2025-07-07 09:46:00

**Current State**: Single unified comment submission

**Desired State**: Unified input with service selection checkboxes and dynamic validation

**Business Value**: Users can write once and selectively send to services with appropriate validation

**Functional Requirements**:
- Unified comment input field
- Service selection checkboxes
- Dynamic validation based on selected services
- Submit to ALL selected services independently

**Acceptance Criteria**:
- User can select which services to send to
- Validation changes based on service selection
- All selected services receive the comment
- Partial failures handled gracefully

---

### REQ-0005-FUNC-00: Service State Conflict Resolution

- **Status**: Deprecated
- **Priority**: P0
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 09:43:48
- **Updated**: 2025-07-07 13:48:59

**Current State**: Unified state approach with conflicts

**Desired State**: Trust most advanced state (highest episode progress) for scrobbling authority

**Business Value**: Consistent scrobbling behavior that respects the most accurate service data

**Functional Requirements**:
- Identify service with highest episode progress
- Handle 'Completed + partial episodes' as watching
- Show all service states transparently
- Use most advanced state for scrobbling decisions

**Acceptance Criteria**:
- MAL ep 8, AniList ep 5 → MAL is authority
- All service states visible to user
- Most advanced state highlighted
- Scrobbling follows most advanced state logic

---

### REQ-0006-FUNC-00: Per-Service Scrobbling Logic

- **Status**: Deprecated
- **Priority**: P0
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 09:43:48
- **Updated**: 2025-07-07 13:51:51

**Current State**: Unified scrobbling logic

**Desired State**: Each service follows its own scrobbling rules and rewatch logic

**Business Value**: Accurate scrobbling that respects service-specific behaviors and limitations

**Functional Requirements**:
- Trakt: Simple scrobbling, no complex logic
- AniList: Episode progression rules, COMPLETED → REWATCHING
- MAL: Same as AniList but no REWATCHING status
- Independent service failures

**Acceptance Criteria**:
- Each service scrobbles according to its own rules
- AniList rewatch logic implemented fully
- MAL rewatch logic without REWATCHING status
- Service failures don't affect others

---

### REQ-0007-FUNC-00: Per-Service Independent Scrobbling Logic

- **Status**: Validated
- **Priority**: P0
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 13:42:28
- **Updated**: 2025-07-09 08:52:49

**Current State**: Complex authority-based scrobbling with service conflicts

**Desired State**: Simple per-service scrobbling where each service follows identical logic based on its own state

**Business Value**: Predictable scrobbling behavior that respects each service's current state without complex conflict resolution

**Functional Requirements**:
- Any status ≠ 'watching' becomes 'watching' when scrobbling episode > current episode
- Episode = total episodes becomes 'completed' + increment rewatch count
- AniList special: if initial status was 'completed' and episode = total episodes → 'rewatching'
- Each service applies logic independently based on its own state
- No cross-service authority or conflict resolution

**Acceptance Criteria**:
- AniList: Watching ep 3, MAL: Watching ep 8 → Scrobble ep 4: AniList→4, MAL stays 8
- AniList: Paused ep 5, MAL: Dropped ep 3 → Scrobble ep 4: AniList→Watching ep 5, MAL→Watching ep 4
- AniList: Completed → Scrobble final ep → Rewatching ep 1
- Each service processes scrobbling independently
- Transparent per-service results shown to user

---

### REQ-0008-FUNC-00: Unified Rating Input with 0.1 Step Precision

- **Status**: Deprecated
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 13:43:49
- **Updated**: 2025-07-07 14:30:20

**Current State**: Limited precision rating input that doesn't support detailed rating scales

**Desired State**: Unified 10-point decimal input with 0.1 step precision (5.2, 4.6, 7.2) that converts to service-specific scales

**Business Value**: Future-proof rating system that supports any tracker's scale while providing detailed rating precision

**Functional Requirements**:
- Accept 0.0-10.0 decimal input with 0.1 step precision
- Convert to service formats: Trakt (nearest 0.5), AniList (×10), MAL (nearest int)
- Support get, update, and remove operations per service
- Handle service-specific remove logic (0 for AniList, actual remove for others)
- Show conversion preview to users

**Acceptance Criteria**:
- User can input 5.2, 4.6, 7.2 and see accurate service conversions
- Service independence - each service processes ratings independently
- Conversion handles edge cases and service limits
- Remove/clear rating works per service specifications

---

### REQ-0009-FUNC-00: Unified Rating Input with Accurate Service Conversion

- **Status**: Approved
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 14:30:20
- **Updated**: 2025-07-07 14:30:42

**Current State**: Rating input that doesn't match actual service limitations and scales

**Desired State**: 0.1 step precision input (0.0-10.0) with accurate conversion to each service's actual rating format

**Business Value**: Accurate rating conversion that respects each service's actual limitations and user preferences

**Functional Requirements**:
- Accept 0.0-10.0 decimal input with 0.1 step precision
- Detect AniList user's rating scale preference from API
- Convert to service formats: Trakt (integer 1-10), MAL (integer 1-10), AniList (based on user preference)
- AniList conversion: 10-point integer, 10-point 0.5 step, or 100-point integer
- Standard rounding for integers (6.5 → 7)
- Support get, update, and remove operations per service
- Handle service-specific remove logic (0 for AniList, actual remove for others)
- Show conversion preview with actual values

**Acceptance Criteria**:
- User can input 6.5 and see: Trakt 7/10, MAL 7/10, AniList varies by preference
- AniList scale detection works from user API preferences
- Conversion handles all edge cases correctly
- Remove/clear rating works per service specifications
- Preview shows actual converted values

---

### REQ-0010-FUNC-00: AniList Manual Add to History Functionality

- **Status**: Approved
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: Development Team
- **Created**: 2025-07-07 16:06:24
- **Updated**: 2025-07-08 04:53:55

**Current State**: Manual add to history only works for Trakt service, AniList is not supported

**Desired State**: Manual add works for both Trakt and AniList with service-appropriate behavior

**Business Value**: Provides consistent manual scrobbling experience across all supported services

**Functional Requirements**:
- Manual add button works for AniList users
- Movies: mark as completed on AniList
- Shows: increment episode progress and update status appropriately
- Works correctly after undo operations
- Integrates with existing manual add UI

**Acceptance Criteria**:
- Manual add button functional for AniList
- Movies correctly marked as completed
- Show episodes increment with proper status updates
- Undo → manual add → correct state restoration
- UI shows appropriate feedback for AniList operations

---

## INTF Requirements

### REQ-0001-INTF-00: Service Transparency UI

- **Status**: Deprecated
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 09:43:49
- **Updated**: 2025-07-07 14:17:25

**Current State**: Generic UI hiding service differences

**Desired State**: Transparent UI showing service-specific status, capabilities, and errors

**Business Value**: Users understand exactly what each service can do and what will happen

**Functional Requirements**:
- Service badge enhancements
- Service-specific error display
- Service capability indicators
- Global scrobbling toggle

**Acceptance Criteria**:
- User sees service-specific status
- Individual service errors shown
- Service capabilities clearly indicated
- Global toggle controls all enabled services

---

### REQ-0002-INTF-00: Global Scrobbling Toggle

- **Status**: Approved
- **Priority**: P1
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 14:17:15
- **Updated**: 2025-07-07 16:14:35

**Current State**: No way to quickly disable scrobbling across all services

**Desired State**: Single global toggle near service badges that disables/enables scrobbling for all services

**Business Value**: Users can quickly disable scrobbling when needed without affecting other features

**Functional Requirements**:
- Single global scrobbling toggle
- Located near service badges
- Disables scrobbling for ALL services when off
- No per-service overrides - global only
- Simple on/off functionality

**Acceptance Criteria**:
- Toggle is easily accessible near service badges
- When off, no scrobbling occurs on any service
- When on, scrobbling works normally for all services
- No complex per-service controls
- Simple binary on/off state

---

## NFUNC Requirements

### REQ-0001-NFUNC-00: Service Independence Architecture

- **Status**: Deprecated
- **Priority**: P0
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 09:43:48
- **Updated**: 2025-07-07 14:11:45

**Current State**: Services coupled through unified state

**Desired State**: Each service maintains completely independent state with parallel operations

**Business Value**: Robust system where individual service failures don't affect others

**Functional Requirements**:
- Independent service state management
- Parallel data loading
- Graceful degradation on service failures
- Service health monitoring

**Acceptance Criteria**:
- Service failures are isolated
- Partial results shown as data loads
- Service health status visible
- No blocking on slowest service

---

### REQ-0002-NFUNC-00: Enhanced Service Independence Architecture

- **Status**: Ready
- **Priority**: P0
- **Risk Level**: Medium
- **Author**: TMSync Team
- **Created**: 2025-07-07 14:11:25
- **Updated**: 2025-07-09 07:51:50

**Current State**: Services coupled through unified state with poor error handling and timeout management

**Desired State**: Complete service independence with intelligent loading states, auto-retry for rate limits, and graceful user intervention patterns

**Business Value**: Robust system with excellent UX that handles real-world API limitations gracefully while maintaining service isolation

**Functional Requirements**:
- Parallel data loading with partial results display
- Loading timeout handling: 'Taking longer than usual' after 10-15s
- Manual intervention for user actions during loading/errors
- Auto-retry for rate limits with generous window
- Manual retry for auth failures and other errors
- Track auth status and rate limit state per service
- Minimal service status text when relevant
- Complete state isolation per service

**Acceptance Criteria**:
- Services load in parallel, show results as available
- Loading states update with helpful text after timeout
- User actions blocked/queued during service issues with manual intervention
- Rate limits auto-retry after generous window
- Minimal status text: 'Rate limited' when needed
- Service failures completely isolated
- Auth status tracked per service

---

## TECH Requirements

### REQ-0001-TECH-00: Handle Trakt 409 Duplicate Scrobble Conflicts

- **Status**: Approved
- **Priority**: P2
- **Risk Level**: Low
- **Author**: Development Team
- **Created**: 2025-07-07 15:52:54
- **Updated**: 2025-07-08 09:09:04

**Current State**: Users get cryptic errors when Trakt returns 409 Conflict for duplicate scrobbles within cooldown period

**Desired State**: Users see clear messages about cooldown periods and when they can scrobble again

**Business Value**: Improves user experience by explaining API rate limits instead of showing confusing errors

**Functional Requirements**:
- Parse expires_at timestamp from 409 response
- Show user-friendly cooldown message with time remaining
- Optionally disable scrobbling UI until cooldown expires
- Handle in API error handling layer

**Acceptance Criteria**:
- 409 responses show clear cooldown message
- Users see time remaining until next scrobble allowed
- No cryptic API errors displayed
- Scrobbling UI respects cooldown period

---

### REQ-0002-TECH-00: Fix Video TimeUpdate Race Condition in Scrobbling

- **Status**: Validated
- **Priority**: P0
- **Risk Level**: Medium
- **Author**: MCP User
- **Created**: 2025-07-09 08:55:03
- **Updated**: 2025-07-09 08:58:19

**Current State**: Video timeupdate events continue firing after scrobble completion, causing sendScrobbleStart to be called even after episode is marked complete, creating race conditions with threshold processing

**Desired State**: Video timeupdate event handler respects completion state and prevents any scrobble operations after completion using completedRef guard

**Business Value**: Eliminates duplicate API calls and race conditions between video events and scrobble completion logic

**Functional Requirements**:
- Add completedRef.current guard in processThrottledTimeUpdate
- Prevent sendScrobbleStart after completion
- Ensure video event handler respects scrobble completion state

**Acceptance Criteria**:
- Video timeupdate events stop triggering scrobble operations after completion
- No sendScrobbleStart calls after completedRef.current is true
- Race condition between video events and threshold processing eliminated

---

