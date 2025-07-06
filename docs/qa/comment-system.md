# Comment System Q&A

## Core Problem & Solution

### Q: How do we handle the fundamental difference between Trakt comments and AniList notes?

**A**: **Tabbed interface with separation**:
- **Service-specific tabs**: Individual tabs for each service
- **Write to All tab**: Unified input with service selection

### Q: What was confusing about the current unified comment approach?

**A**: Multiple issues we encountered:
1. **5-word minimum** doesn't apply to AniList notes (user wants to write "good")
2. **Spoiler checkbox** was confusing - didn't explain it's Trakt-only
3. **AniList submission failed** - comment only went to Trakt, not AniList
4. **Button text confusion** - "New Comment" misleading for AniList's single note

## Write to All Functionality

### Q: How does the "Write to All" tab work?

**A**:
- **Service selection checkboxes**: `☑ Trakt ☑ AniList ☐ MAL`
- **Same text goes to all selected services**
- **Validation**: Apply most restrictive rules from selected services
- **If Trakt selected**: Apply 5-word minimum to all services
- **If only AniList/MAL**: No minimum word requirement
- **Spoiler flags**: Only applied to Trakt, ignored for others

### Q: What about real-time validation when toggling services?

**A**: **Yes, immediate validation changes**:
- User unchecks Trakt mid-typing → validation changes immediately
- Dynamic feedback as user selects/deselects services

## Error Handling & Submission

### Q: How do we handle comment submission failures?

**A**: 
- **No automatic retry** - user must manually retry
- **Show per-service success/failure** status
- **Failed services stay checked** for easy retry
- **No complex sync logic** - simple success/failure reporting

### Q: Why did AniList comment submission fail in our testing?

**A**: The `handlePostComment` function only posted to the **first successful service**, not all services. It was designed with "primary service" approach instead of multi-service posting. We fixed this to post to ALL enabled services.

## Service-Specific Behavior

### Service Paradigms

**Trakt**: Multiple comments that accumulate over time
**AniList**: Single note that gets overwritten
**MAL**: Single note similar to AniList

### Validation Rules

**Trakt**: 5-word minimum, supports spoiler flags
**AniList**: No minimum length, no spoiler support
**MAL**: No minimum length, no spoiler support

### UI Differences

**Trakt Tab**: "Add Comment" button, comment history, spoiler checkbox
**AniList Tab**: "Update Note" button, current note display, no spoiler option
**MAL Tab**: Similar to AniList, "Update Note" button

## Technical Implementation

### Tabbed Interface Requirements

- Clear separation between service paradigms
- Service-specific UI elements and terminology
- Consistent navigation between tabs
- Service availability handling

### Dynamic Validation Requirements

- Real-time validation changes based on service selection
- Clear feedback about which services impose which rules
- Validation state persistence across tab switches
- Error messaging that explains service-specific requirements

### Submission Logic Requirements

- Submit to ALL selected services simultaneously
- Handle partial failures gracefully
- Provide detailed feedback per service
- Allow selective retry of failed services

## Success Criteria

- User understands difference between comments and notes
- Validation rules are clear and change appropriately
- All selected services receive the content
- Partial failures are handled gracefully
- User can retry failed services without losing content