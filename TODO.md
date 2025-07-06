# TMSync Development TODO

## Current Phase: Phase 4 - Advanced Features & Edge Cases

### Recently Completed (Phase 3)
- **Problem 1: Users Don't Know Which Services Are Active** ✅ Complete
- **Problem 2: Users Can't Control Which Services Handle Their Actions** ✅ Complete
- **Problem 3: Service Authentication Infrastructure** ✅ Complete

### Phase 4: Advanced Features & Edge Cases

#### Priority 1: Complete AniList Integration ✅ COMPLETED
**Current State**: ✅ Progress tracking implemented, ✅ INTEGRATED into scrobble flow

**✅ Fixed Critical Issue**: AniList progress tracking now fires correctly because:
- Modified `handleScrobbleStop` in `src/background/handlers/handleScrobble.ts` (lines 211-262)
- Added parallel processing of progress tracking services alongside real-time scrobbling services
- At 80% completion: both `stopScrobble` (Trakt) and `addToHistory` (AniList) are called
- Fixed authentication token loading in `addToHistory` and `removeFromHistory` methods
- Services process concurrently with proper error handling and status updates

**Success Criteria**: 
- ✅ AniList supports both anime shows and movies (implemented)
- ✅ Media search and identification works (implemented) 
- ✅ Progress tracking integration into completion threshold flow (COMPLETED)
- 📋 Rating system properly translates between Trakt (1-10) and AniList (1-100) scales (deferred)

**Implementation Details**:
- Progress tracking services are filtered by user preferences and authentication status
- Both services run in parallel when 80% threshold is reached
- Comprehensive logging shows service activity for debugging
- Service status manager updates reflect progress tracking operations
- Authentication fixed to properly load tokens from chrome.storage

#### Priority 2: Media Identification & Cross-Service Mapping
**Success Criteria**: Shows can be identified across different services even with naming differences

**Deferred Items** (when needed):
- EpisodeMapper for complex show structures
- MediaIdentifier service for cross-service mapping  
- Confidence scoring for media matching
- Database mapping utilities for episode/season reconciliation

### Completed Phase 3 Problems

#### Problem 1: Users Don't Know Which Services Are Active ✅ COMPLETE
**Success Criteria**: Users can see at a glance which tracking services are enabled and their status (authenticated, syncing, etc.)

**✅ Implemented Solution**:
- Real-time service status indicators integrated into scrobble notification
- Per-service activity states: scrobbling, tracking_progress, idle, error, not logged in
- Immediate status updates when authentication changes (login/logout)
- Honest capability system - services only claim what they actually implement
- Visual indicators with color-coded icons and descriptive text

#### Problem 2: Users Can't Control Which Services Handle Their Actions ✅ COMPLETE
**Success Criteria**: Users can choose which services to scrobble to, rate on, comment to, etc., either globally or per-action

**✅ Implemented Solution**:
- Global service toggle switches in options page 
- Real-time status updates when services are enabled/disabled
- All handlers (scrobble, rate, comment, history) respect user preferences
- Smart state recovery: re-enabled services resume appropriate state during active operations
- Service filtering with both user preference AND authentication status checks
- Default behavior: use all available authenticated services

#### Problem 3: Service Authentication Is Scattered and Confusing
**Success Criteria**: Users have a unified interface to authenticate with and manage multiple tracking services

**Questions to Consider**:
- Should auth be in options page, popup, or both?
- How do we handle different OAuth flows and token lifecycles?
- What happens when a service goes offline or tokens expire?

**Alternative Approaches**:
- Centralized auth hub vs distributed auth buttons
- Proactive re-auth vs on-demand error handling
- Service-specific settings vs unified configuration

#### Problem 4: Error States Provide Poor User Experience 🔄 DEFERRED
**Success Criteria**: When services fail, users understand what happened and how to fix it, without breaking their workflow

**Decision**: Defer until we encounter specific API failures in real usage. Better to solve actual problems than theoretical ones.

**Approach**: Tackle error handling organically when building other features and encountering real failure modes. This will drive better, more targeted solutions.

**Questions to Consider** (when we encounter real errors):
- How granular should error reporting be?
- Should errors be service-specific or aggregated?
- How do we handle partial failures (one service works, another doesn't)?

**Alternative Approaches**:
- Toast notifications vs status indicators vs error pages
- Auto-retry vs manual retry vs graceful degradation
- Technical error details vs user-friendly explanations

**Known Issues**:

- ✅ **AniList Unrate Feature Fixed**: Click-to-unrate now works correctly for both Trakt and AniList
  - Root cause: AniList API expects `score: 0` to remove ratings, not `null` or omitted score
  - Solution: Modified `setAnimeRating` to send `score: 0` when unrating
  - Status: Both Trakt and AniList unrating work perfectly
  - Commit: e2ab516 - fix: resolve AniList unrate functionality by sending score 0

- Scrobble race condition: Extra start request after stop completion can cause loops when errors occur
  - Root cause: Timing between setting historyIdRef and pending video events
  - Impact: Edge case during rapid seeking/testing, not affecting normal usage
  - Solution: Consider debouncing video events or improving state synchronization

### Completed (Phase 2)

- [x] Create TrackerService interface defining common operations
- [x] Implement TraktService with full TrackerService interface compliance
- [x] Implement AniListService with TrackerService interface
- [x] Create ServiceRegistry for managing multiple services
- [x] Add service-agnostic types (ServiceComment, ServiceProgressInfo, etc.)
- [x] Update all handlers and components to use service-agnostic types
- [x] Create service initialization and testing infrastructure

### Future Phases

See CLAUDE.md Development Roadmap for Phase 4 items.

---
*Last updated: 2025-07-05*
*Current commit: 9aaf815 - Complete Phase 3: Multi-service UI/UX integration with service control toggles*
