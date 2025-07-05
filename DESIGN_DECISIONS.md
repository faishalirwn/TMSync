# TMSync Design Decisions

This document captures product design decisions made during development to maintain consistency and provide context for future development.

## Product Philosophy

**Iterative Design**: Building product design collaboratively as we develop, making decisions based on user needs and technical feasibility rather than upfront comprehensive planning.

## Problem 2: Service Selection & Control

**Decision Date**: 2025-07-05  
**Context**: Users need control over which tracking services handle their actions (scrobbling, rating, commenting, etc.)

### Selected Approach: Global Service Toggles

**Design Decision**:

- **Location**: Options page settings (not inline controls)
- **Scope**: Global enable/disable per service (not per-action granularity)
- **Default Behavior**: Use all available authenticated services
- **Disabled State**: When user disables all services, treat like unauthenticated state
  - Content script behavior: Only quick links available
  - Options page and popup: Remain fully functional
  - No scrobbling, rating, or commenting functionality

### Alternative Approaches Considered

1. **Per-Action Control**: Choose services per scrobble/rate/comment action
   - *Rejected*: Too complex for initial implementation, can be added later

2. **Inline Controls**: Service selection within content script UI
   - *Rejected*: Would clutter interface, better suited for settings

3. **Per-Media-Type Control**: Different services for movies vs shows
   - *Rejected*: Not a common user need, adds unnecessary complexity

### Technical Implementation Plan

1. **User Preferences Storage**: Extension storage for service enable/disable state
2. **Service Filtering**: Modify existing handlers to filter services based on user preferences
3. **UI Integration**: Add toggle switches to options page authentication section
4. **State Management**: Extend service status system to include user preference state

### Future Enhancements

- Per-action service selection (if user feedback indicates need)
- Per-media-type preferences
- Temporary service overrides for specific actions

---

## Design Decision Template

For future decisions, use this format:

### Problem: [Brief Description]

**Decision Date**: YYYY-MM-DD  
**Context**: [Why this decision was needed]

**Selected Approach**: [What we chose]

**Design Decision**:
- Key aspects of the solution
- User experience considerations
- Technical constraints

**Alternative Approaches Considered**:
1. **Option Name**: Description
   - *Rejected*: Reason

**Implementation Notes**: [Technical details]

**Future Considerations**: [Potential evolution]

---

*Last updated: 2025-07-05*
