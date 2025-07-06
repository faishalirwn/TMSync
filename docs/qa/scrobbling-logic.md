# Scrobbling Logic Q&A

## Service State Conflicts

### Q: How do we handle conflicting service states?

**A**: We show all states transparently and use intelligent logic for scrobbling.

### Q: Give me a specific example of conflicting states.

**A**: Here's the exact scenario we discussed:

- **Trakt**: "Not watching" (user hasn't started)
- **AniList**: Episode 6/12, Status "Watching" 
- **MAL**: Episode 8/12, Status "Completed"

### Q: How do we handle this specific conflict when user wants to watch episode 6?

**A**: We **trust the most advanced state** for scrobbling logic:

1. **Identify most advanced**: MAL has episode 8, so MAL is most advanced
2. **For episode 6 scrobbling**: 
   - **AniList**: Will scrobble normally (6 > current 5, next episode)
   - **MAL**: Won't scrobble (6 < current 8, going backwards)
   - **Trakt**: Will scrobble normally (simple, no conflicts)

### Q: What about the weird "Completed + partial episodes" state?

**A**: **Special case**: Treat "Completed + partial episodes" as "watching"

So in our example, even though MAL shows "Completed", since it has partial episode progress (8/12), we treat it as "watching" status. This means:
- **Episodes 1-8**: MAL won't scrobble (going backwards)
- **Episodes 9-12**: MAL will scrobble along with AniList
- **After episode 12**: Both services get rewatch prompt (but unified since same state)

### Q: How do we visually show these conflicting states?

**A**: 
- **Show all three states** in the UI transparently
- **Highlight the most advanced** one (MAL in this example)
- **Re-evaluate** most advanced after any service updates
- **Visual space**: Show essential info, optimize layout later

## Scrobbling Controls

### Q: What about the scrobbling toggle - per-service or global?

**A**: **Global toggle only**. We removed per-service scrobble toggles because:
- Simplifies the UI
- Per-service complexity wasn't worth it
- Global toggle affects only scrobbling, not rating or comments

### Q: What's the service authority hierarchy?

**A**: 
1. **Options page**: Service enable/disable (most authoritative)
2. **Service authentication**: Must be logged in  
3. **Global scrobble toggle**: Enable/disable scrobbling only
4. **Service-specific errors**: Individual service failures

### Q: How does the toggle interact with service enable/disable?

**A**: 
- **Options page is authoritative**: If Trakt disabled via options, toggle only affects AniList
- **Scrobble toggle scope**: Only affects scrobbling, not rating or comments
- **Service independence**: Individual service failures don't affect toggle state

### Q: What about partial failures during scrobbling?

**A**: **Scrobble failures don't affect toggle state** - they're unrelated. Show per-service error status separately from toggle.

## Rewatch Logic

### Q: How does AniList rewatch logic work?

**A**: AniList has complex episode progression rules:

1. **Status Check**: If user status is "COMPLETED", show inline notification in ScrobbleNotification asking if they want to change to "REWATCHING"
2. **Episode Progress Logic**:
   - If current episode ≤ user's last watched episode: **No scrobbling/progress tracking**
   - If current episode > user's last watched episode: **Scrobble normally**
   - Continue until current episode = total episodes
   - When complete: Increment rewatch count by 1, set status to "COMPLETED"
   - On next rewatch: Repeat the same process

### Q: How is MAL different?

**A**: **Same logic but no "REWATCHING" status**:
- MAL has: Watching, Completed, On Hold, Dropped, Plan to Watch
- Same episode progression rules as AniList
- Cannot distinguish between first watch and rewatch in status

### Q: Should we implement simple rewatch logic first, then add complexity?

**A**: **No, implement full logic from the start**. This is critical for user experience to prevent double-counting episodes and incorrect progress.

### Q: What if the rewatch logic fails or can't determine episode order?

**A**: **Block scrobbling and tell user why**. Don't fallback to simple scrobbling. Show specific error in ScrobbleNotification. This shouldn't happen in the first place.

## Service-Specific Scrobbling Rules

### Trakt Scrobbling

- **Simple**: Start scrobbling immediately, no status conflicts
- **Rewatch**: Handled transparently by service
- **Episodes**: Any episode can be scrobbled multiple times
- **Real-time**: Scrobbling every few seconds during playback

### AniList Scrobbling

- **Status Check**: Handle COMPLETED → REWATCHING transitions
- **Episode Progression**: Complex rules for episode ordering
- **Progress Updates**: At episode completion (80% threshold)
- **Rewatch Counting**: Increment rewatch count appropriately

### MAL Scrobbling

- **Same as AniList**: Follow same episode progression rules
- **Status Limitation**: No REWATCHING status available
- **Progress Updates**: At episode completion like AniList
- **Rewatch Detection**: Cannot distinguish in status

## Implementation Requirements

### State Resolution Logic

- Identify most advanced state across all services
- Handle "Completed + partial episodes" special case
- Re-evaluate authority after service updates
- Transparent display of all service states

### Rewatch Implementation

- Full rewatch logic from start (no simplified fallback)
- Service-specific status transitions
- Episode progression validation
- Error handling for edge cases

### Control Integration

- Global toggle in service badge area
- Respect service authority hierarchy
- Independent error handling per service
- Clear feedback for scrobbling state

## Success Criteria

- Most advanced state correctly identified
- Service-specific rewatch logic works properly
- Global toggle controls all enabled services
- Partial failures handled gracefully
- User understands what each service will do