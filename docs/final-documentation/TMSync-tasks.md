# TMSync - Tasks Documentation

Generated on: 2025-07-07 21:40:41

## Abandoned Tasks

### TASK-0001-00-00: Refactor service architecture for independence

- **Status**: Abandoned
- **Priority**: P0
- **Effort**: XL
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:45:58
- **Updated**: 2025-07-07 14:11:45

**User Story**: As a developer, I want services to operate independently so failures don't cascade

**Acceptance Criteria**:
- Separate service state management
- Implement parallel data loading
- Add service health monitoring
- Ensure graceful degradation

**Linked Requirements**:
- REQ-0001-NFUNC-00: Service Independence Architecture

---

### TASK-0002-00-00: Implement service state conflict resolution algorithm

- **Status**: Abandoned
- **Priority**: P0
- **Effort**: M
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:45:58
- **Updated**: 2025-07-07 13:49:20

**User Story**: As a user, I want the system to intelligently handle conflicting service states for scrobbling

**Acceptance Criteria**:
- Identify most advanced service state
- Handle 'completed + partial' edge case
- Display all states transparently
- Use most advanced for scrobbling authority

**Linked Requirements**:
- REQ-0005-FUNC-00: Service State Conflict Resolution

---

### TASK-0003-00-00: Implement AniList rewatch logic

- **Status**: Abandoned
- **Priority**: P0
- **Effort**: L
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:45:59
- **Updated**: 2025-07-07 13:51:51

**User Story**: As a user, I want AniList to handle rewatching correctly with proper episode progression

**Acceptance Criteria**:
- Implement full episode progression rules
- Handle COMPLETED → REWATCHING transitions
- Prevent double-counting episodes
- Test with various rewatch scenarios

**Linked Requirements**:
- REQ-0006-FUNC-00: Per-Service Scrobbling Logic

---

### TASK-0004-00-00: Implement MAL rewatch logic

- **Status**: Abandoned
- **Priority**: P0
- **Effort**: M
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:45:59
- **Updated**: 2025-07-07 13:51:51

**User Story**: As a user, I want MAL to handle rewatching similar to AniList but without REWATCHING status

**Acceptance Criteria**:
- Implement rewatch logic without REWATCHING status
- Handle status limitations
- Ensure consistent behavior with AniList
- Test rewatch detection

**Linked Requirements**:
- REQ-0006-FUNC-00: Per-Service Scrobbling Logic

---

### TASK-0006-00-00: Build unified rating input with conversion preview

- **Status**: Abandoned
- **Priority**: P1
- **Effort**: M
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:45:59
- **Updated**: 2025-07-07 13:49:20

**User Story**: As a user, I want to input a rating once and see how it converts to each service format

**Acceptance Criteria**:
- Accept 0.0-10.0 decimal input
- Show conversion preview for all services
- Implement service-specific conversion logic

**Linked Requirements**:
- REQ-0002-FUNC-00: Unified Rating Input with Service Conversion

---

### TASK-0009-00-00: Enhance service badges and status indicators

- **Status**: Abandoned
- **Priority**: P1
- **Effort**: M
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:46:00
- **Updated**: 2025-07-07 14:17:38

**User Story**: As a user, I want to see clear service status and capabilities so I understand what each service can do

**Acceptance Criteria**:
- Enhanced service badges with status
- Service-specific error display
- Service capability indicators
- Global scrobbling toggle

**Linked Requirements**:
- REQ-0001-INTF-00: Service Transparency UI

---

### TASK-0010-00-00: Implement service-specific error handling and display

- **Status**: Abandoned
- **Priority**: P1
- **Effort**: M
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:46:00
- **Updated**: 2025-07-07 14:17:38

**User Story**: As a user, I want to see specific errors for each service so I know exactly what failed

**Acceptance Criteria**:
- Display individual service errors
- Handle different error formats (HTTP, GraphQL)
- Show retry options for failed services
- Maintain error context per service

**Linked Requirements**:
- REQ-0001-INTF-00: Service Transparency UI

---

### TASK-0012-00-00: Build enhanced rating input with 0.1 step precision

- **Status**: Abandoned
- **Priority**: P1
- **Effort**: M
- **Assignee**: Unassigned
- **Created**: 2025-07-07 13:45:35
- **Updated**: 2025-07-07 14:30:29

**User Story**: As a user, I want to input precise ratings like 5.2, 4.6, 7.2 and see how they convert to each service

**Acceptance Criteria**:
- Support 0.0-10.0 input with 0.1 step precision
- Implement enhanced conversion algorithms
- Show precise conversion preview
- Handle service-specific remove/clear logic
- Test with edge cases and service limits

**Linked Requirements**:
- REQ-0008-FUNC-00: Unified Rating Input with 0.1 Step Precision

---

## Not Started Tasks

### TASK-0005-00-00: Implement per-service rating display components

- **Status**: Not Started
- **Priority**: P1
- **Effort**: M
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:45:59
- **Updated**: 2025-07-07 09:45:59

**User Story**: As a user, I want to see individual service ratings in their native formats so I understand what each service currently has

**Acceptance Criteria**:
- Create rating display components for each service
- Handle missing ratings gracefully
- Show service availability states

**Linked Requirements**:
- REQ-0001-FUNC-00: Per-Service Rating Display

---

### TASK-0007-00-00: Create tabbed comment interface

- **Status**: Not Started
- **Priority**: P1
- **Effort**: L
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:46:00
- **Updated**: 2025-07-07 09:46:00

**User Story**: As a user, I want separate tabs for each service's comments so I can manage them independently

**Acceptance Criteria**:
- Create tab component for each service
- Handle services without comment support
- Show service-specific comment history

**Linked Requirements**:
- REQ-0003-FUNC-00: Service-Specific Comment Tabs

---

### TASK-0008-00-00: Implement write-to-all with service selection

- **Status**: Not Started
- **Priority**: P1
- **Effort**: L
- **Assignee**: Unassigned
- **Created**: 2025-07-07 09:46:00
- **Updated**: 2025-07-07 09:46:00

**User Story**: As a user, I want to write a comment once and choose which services to send it to

**Acceptance Criteria**:
- Add service selection checkboxes
- Implement dynamic validation
- Submit to all selected services
- Handle partial failures gracefully

**Linked Requirements**:
- REQ-0004-FUNC-00: Write to All Services with Selection

---

### TASK-0011-00-00: Implement per-service independent scrobbling algorithm

- **Status**: Not Started
- **Priority**: P0
- **Effort**: L
- **Assignee**: Unassigned
- **Created**: 2025-07-07 13:45:35
- **Updated**: 2025-07-07 13:45:35

**User Story**: As a user, I want each service to handle scrobbling based on its own state without complex conflict resolution

**Acceptance Criteria**:
- Implement universal scrobbling rules for all services
- Handle AniList completed→rewatching special case
- Each service processes independently
- Show transparent per-service results
- Test with various service state combinations

**Linked Requirements**:
- REQ-0007-FUNC-00: Per-Service Independent Scrobbling Logic

---

### TASK-0013-00-00: Implement enhanced service independence architecture

- **Status**: Not Started
- **Priority**: P0
- **Effort**: XL
- **Assignee**: Unassigned
- **Created**: 2025-07-07 14:11:57
- **Updated**: 2025-07-07 14:11:57

**User Story**: As a user, I want services to work independently with smart loading states and rate limit handling so I have a robust experience even when services have issues

**Acceptance Criteria**:
- Implement parallel data loading with partial results
- Add timeout handling with helpful messaging
- Create manual intervention patterns for loading states
- Build auto-retry for rate limits with generous windows
- Add minimal status text for service issues
- Ensure complete service state isolation
- Handle 429 rate limit responses gracefully

**Linked Requirements**:
- REQ-0002-NFUNC-00: Enhanced Service Independence Architecture

---

### TASK-0014-00-00: Add global scrobbling toggle near service badges

- **Status**: Not Started
- **Priority**: P1
- **Effort**: S
- **Assignee**: Unassigned
- **Created**: 2025-07-07 14:17:38
- **Updated**: 2025-07-07 14:17:38

**User Story**: As a user, I want a simple toggle to turn off scrobbling for all services when needed

**Acceptance Criteria**:
- Add toggle near service badges
- When off, disable scrobbling for all services
- When on, enable scrobbling for all services
- Simple on/off state - no complexity
- Easy to find and use

**Linked Requirements**:
- REQ-0002-INTF-00: Global Scrobbling Toggle

---

### TASK-0015-00-00: Build rating input with accurate service conversion

- **Status**: Not Started
- **Priority**: P1
- **Effort**: M
- **Assignee**: Unassigned
- **Created**: 2025-07-07 14:30:42
- **Updated**: 2025-07-07 14:30:42

**User Story**: As a user, I want to input precise ratings and see accurate conversions to each service's actual format

**Acceptance Criteria**:
- Implement 0.1 step input (0.0-10.0)
- Detect AniList user rating scale from API
- Convert correctly: Trakt/MAL to integers, AniList to user preference
- Show conversion preview with actual values
- Handle standard rounding for integers
- Support remove/clear per service specs
- Handle conversion edge cases

**Linked Requirements**:
- REQ-0009-FUNC-00: Unified Rating Input with Accurate Service Conversion

---

