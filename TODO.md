# TMSync Development TODO

## Current Phase: Phase 3 - UI/UX Multi-Service Integration

### Recently Completed
- **Problem 1: Users Don't Know Which Services Are Active** ✅ Complete
- **Problem 2: Users Can't Control Which Services Handle Their Actions** 🔄 In Progress
- **Problem 3: Service Authentication Infrastructure** ✅ Complete

### Next Problems to Solve

#### Problem 1: Users Don't Know Which Services Are Active ✅ COMPLETE
**Success Criteria**: Users can see at a glance which tracking services are enabled and their status (authenticated, syncing, etc.)

**✅ Implemented Solution**:
- Real-time service status indicators integrated into scrobble notification
- Per-service activity states: scrobbling, tracking_progress, idle, error, not logged in
- Immediate status updates when authentication changes (login/logout)
- Honest capability system - services only claim what they actually implement
- Visual indicators with color-coded icons and descriptive text

#### Problem 2: Users Can't Control Which Services Handle Their Actions
**Success Criteria**: Users can choose which services to scrobble to, rate on, comment to, etc., either globally or per-action

**Questions to Consider**:
- Should service selection be global settings or per-action choices?
- How do we handle conflicts when services have different capabilities?
- What's the UX for first-time users vs power users?

**Alternative Approaches**:
- Master toggle switches vs smart defaults with override options
- Confirmation prompts vs background delegation to enabled services
- Options page configuration vs inline controls

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

#### Problem 4: Error States Provide Poor User Experience
**Success Criteria**: When services fail, users understand what happened and how to fix it, without breaking their workflow

**Questions to Consider**:
- How granular should error reporting be?
- Should errors be service-specific or aggregated?
- How do we handle partial failures (one service works, another doesn't)?

**Alternative Approaches**:
- Toast notifications vs status indicators vs error pages
- Auto-retry vs manual retry vs graceful degradation
- Technical error details vs user-friendly explanations

**Known Issues**:

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
*Current commit: d37470e - Implement real-time service status indicators system*
