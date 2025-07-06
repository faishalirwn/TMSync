# TMSync Design Decisions & Technical Context

This document serves as the central index for all design decisions, technical context, and Q&A content related to TMSync's multi-service architecture redesign.

## 📋 Quick Reference

**For Implementation**: Reference specific Q&A sections below for detailed technical context
**For Planning**: Update relevant Q&A sections during any planning or design sessions
**For Roadmap**: See `ROADMAP.md` for current todos and implementation tasks

## 🎯 Core Design Philosophy

**Per-Service Independence with Unified Input Options**

**Problem**: Current unified approach creates UX confusion and technical complexity
**Solution**: Respect service differences, show actual states, provide optional unified input

## 📚 Technical Context Areas

### Multi-Service Architecture Q&A

**Current Status**: Organized into topic-specific files
**Location**: `docs/qa/` directory
**Contains**: 
- `rating-system.md` - Rating display, input, and conversion logic
- `comment-system.md` - Tabbed interface and write-to-all functionality
- `scrobbling-logic.md` - State conflicts and rewatch logic
- `service-integration.md` - Service-specific rules and patterns

### Service-Specific Business Rules

**Trakt.tv**: Simple scrobbling, multiple comments, OAuth with refresh tokens
**AniList**: Complex rewatch logic, single notes, COMPLETED → REWATCHING transitions
**MyAnimeList**: Same as AniList but no REWATCHING status, limited status options

### Rating System Decisions

**Input**: 10-point decimal system (0.0-10.0)
**Display**: Per-service with native scales
**Conversion**: 
- Trakt: Round to nearest 0.5
- AniList: Multiply by 10 (7.5 → 75)
- MAL: Round to nearest integer

### Comment System Decisions

**Architecture**: Tabbed interface with service separation
**Write to All**: Unified input with service selection checkboxes
**Validation**: Dynamic validation based on selected services
**Error Handling**: Per-service success/failure reporting

### Scrobbling Logic Decisions

**State Authority**: Trust most advanced state (highest episode progress)
**Special Case**: "Completed + partial episodes" = treat as "watching"
**Service Independence**: Each service follows its own rewatch logic
**Control**: Global toggle only, no per-service scrobbling toggles

## 📖 Planning Session Guidelines

### When to Update This Documentation

**Always Update During**:
- Architecture planning sessions
- Design decision discussions
- Edge case discovery
- Implementation requirement clarification
- User experience design sessions

**Update Process**:
1. Add new Q&A entries to relevant sections
2. Update existing entries with new insights
3. Cross-reference with ROADMAP.md todos
4. Maintain clear examples and edge cases

### Q&A Format Guidelines

**Good Q&A Entry**:
- Clear, specific question
- Detailed answer with reasoning
- Concrete examples
- Edge cases identified
- Cross-references to implementation

**Example Format**:
```
### Q: How do we handle conflicting service states?
A: We show all states transparently and use intelligent logic for scrobbling.

Example:
- Trakt: "Not watching" 
- AniList: Episode 6/12, Status "Watching"
- MAL: Episode 8/12, Status "Completed"

Result: Trust MAL (most advanced) for scrobbling authority.
```

## 🔍 Current Technical Context

### Service State Conflicts

**Most Advanced State Logic**: Identify service with highest episode progress
**Scrobbling Authority**: Most advanced state determines scrobbling behavior
**UI Display**: Show all states, highlight most advanced

### Rewatch Logic Complexity

**AniList**: Full episode progression rules, status transitions
**MAL**: Same logic but no REWATCHING status
**Implementation**: Full logic from start, no simplified fallback

### Error Handling Patterns

**Service Independence**: Individual failures don't affect others
**Graceful Degradation**: Show partial results, continue with working services
**Retry Logic**: Basic retry on auth failures, no complex queuing

## 🔄 Maintenance Instructions

### Keep This Updated

**During Planning**: Add new Q&A entries immediately
**During Implementation**: Update with implementation insights
**During Testing**: Add edge cases discovered
**During Review**: Refine and clarify existing entries

### Organization Strategy

**Current**: Topic-specific files under `docs/qa/` directory
**Structure**: Organized by functional area for easy navigation
**Maintenance**: Update relevant files during planning sessions

## 📁 File Organization

```
docs/
├── ROADMAP.md                    # Current todos and requirements
├── DESIGN_DECISIONS.md           # This index file
└── qa/                          # Topic-specific Q&A files
    ├── rating-system.md
    ├── comment-system.md
    ├── scrobbling-logic.md
    └── service-integration.md
```

## 🚀 Next Steps

1. **Reference**: Use this document as entry point for technical context
2. **Update**: Add new Q&A entries during planning sessions
3. **Implement**: Reference ROADMAP.md for specific todos
4. **Maintain**: Keep synchronized with ROADMAP.md and implementation progress

**Remember**: This documentation is the source of truth for design decisions and technical context. Keep it current and comprehensive.