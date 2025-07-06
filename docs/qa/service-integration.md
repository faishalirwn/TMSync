# Service Integration Q&A

## Service-Specific Business Rules

### Trakt.tv Integration

**Scrobbling**: Simple - start scrobbling immediately, no status conflicts
**Rewatch**: Handled transparently by service
**Episodes**: Any episode can be scrobbled multiple times
**Comments**: Multiple comments, spoiler flags, 5-word minimum
**Rating**: 1-10 scale with half-star support (rounds to nearest 0.5)
**Authentication**: Standard OAuth with refresh tokens
**API Rate Limits**: ~1000 requests/hour per user

### AniList Integration

**Scrobbling**: Complex episode progression rules
**Rewatch Logic**: COMPLETED → REWATCHING status transitions
**Episodes**: Episode progression validation, no backwards progress
**Comments**: Single note that gets overwritten, no spoiler support
**Rating**: 1-100 scale (multiply 10-point input by 10)
**Authentication**: OAuth with long-lived tokens (1 year)
**API Rate Limits**: ~90 requests/minute
**API Type**: GraphQL with detailed error paths

### MyAnimeList Integration

**Scrobbling**: Same logic as AniList but limited status options
**Rewatch Logic**: Cannot distinguish between first watch and rewatch
**Episodes**: Same progression rules as AniList
**Comments**: Single note similar to AniList
**Rating**: 1-10 scale (round to nearest integer)
**Authentication**: OAuth with refresh tokens
**API Rate Limits**: ~60 requests/minute
**API Type**: REST API with varying error formats

## Data Loading & Performance

### Q: How do we load data from multiple services?

**A**: 
- **Parallel loading**: Load all service data simultaneously
- **Partial display**: Show data as it loads, don't wait for slowest service
- **Timeout handling**: If AniList takes 10 seconds, show partial data

### Q: What about caching strategy?

**A**: **TBD during implementation**. Cache strategy to be determined, priority is performance optimization for later phases.

## Error Handling & Edge Cases

### Q: What about authentication failures during scrobbling?

**A**: **Basic retry logic**:
- Simple retry on auth failures
- Show error if retries exhausted  
- No advanced queuing or complex retry strategies

### Q: How do we handle service API errors?

**A**: **Service independence**:
- Individual service failures don't affect others
- Show service-specific error messages
- Allow retry per service, not globally

### Q: What about edge cases like user manually changing AniList progress?

**A**: **Our logic handles that**. Don't overthink edge cases - handle them when encountered.

### Q: What about episode mapping conflicts between services?

**A**: **Future phase**. Different services have different episode structures, but that's a separate complex problem to solve later.

## Implementation Phases & Migration

### Q: Do we need a migration strategy from current unified approach?

**A**: **No migration strategy needed**. This product is unreleased, so no existing user data to migrate. Clean implementation with per-service architecture from start.

### Q: What about rollback plans?

**A**: Not needed since no users yet. Start fresh with new architecture.

## Service Authority & Hierarchy

### Authentication Hierarchy

1. **Options Page**: Service enable/disable (most authoritative)
2. **Service Authentication**: Must be logged in to each service
3. **Global Controls**: Apply to all authenticated, enabled services
4. **Service-Specific Errors**: Individual service failures

### Service Selection Logic

- **Capability-Based**: Use services based on what features they support
- **Availability-Based**: Only use services that are enabled and authenticated
- **Independent Operation**: Each service operates independently
- **Graceful Degradation**: Continue with working services if others fail

## Future Service Considerations

### Q: How do we add new services?

**A**: 
- Define capability matrix (real-time scrobbling, progress tracking, comments, ratings)
- Implement service-specific business rules
- Add to conversion/validation logic
- Update UI to show service differences

### Extensibility Patterns

- Services should be pluggable with minimal UI changes
- Business rules should be encapsulated per service
- UI should adapt to service capabilities automatically
- Service-specific errors and handling

## API Integration Patterns

### Error Handling Patterns

**Trakt**: HTTP status codes, clear error messages
**AniList**: GraphQL errors with detailed paths
**MAL**: REST API with varying error formats

### Data Conversion Patterns

- Native service types → Service-agnostic types
- Service-agnostic types → UI display formats
- User input → Service-specific formats
- Validation rules per service capability

### Authentication Patterns

- OAuth flows vary by service
- Token refresh strategies differ
- Service-specific scopes and permissions
- Individual service auth status tracking

## Implementation Guidelines

### Service Independence

- Each service maintains its own complete state
- No attempt to reconcile different service states
- UI layers handle display aggregation
- Service failures are isolated

### Multi-Service Operations

- Parallel operations when possible
- Individual error handling per service
- Partial success reporting
- Service-specific retry logic

### Testing Strategy

- Use `npx tsx src/test-services.ts` for multi-service functionality
- Test service-specific edge cases
- Verify service independence
- Validate error handling per service

## Success Criteria

- Services operate independently
- Service-specific business rules respected
- Graceful degradation when services fail
- Easy to add new services
- Clear service capability communication