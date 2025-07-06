# Rating System Q&A

## Philosophy & Approach

### Q: How should rating display and input work?

**A**: **"Unified Input, Per-Service Display"**

### Q: What's the rating scale and conversion?

**A**: 
- **Internal Scale**: 10-point decimal system (0.0 - 10.0)
- **Conversion Rules**:
  - **Trakt**: Round to nearest 0.5 (supports half-stars: 7.3 → 7.5)
  - **AniList**: Convert to 100-point scale (7.3 → 73)
  - **MAL**: Round to nearest integer (7.3 → 7)

### Q: Should we show users what each service will receive before submitting?

**A**: **No**. Users will learn the rounding logic after the fact. They'll learn the respective service intricacies themselves.

### Q: What if user wants different rating intent per service?

**A**: **Not allowed**. It's weird. One rating for all services, but show (GET phase) what each service currently has.

### Q: Example of how this works?

**A**: 
- **Display**: Show `Trakt: 8/10`, `AniList: 85/100`, `MAL: 8/10`
- **Input**: User enters 7.3
- **Result**: Trakt gets 7.5, AniList gets 73, MAL gets 7
- **No preview**: User learns conversion through experience

## Technical Implementation

### Rating Display Requirements

- Show what each service actually has with native scales
- Handle missing ratings gracefully
- Show rating conflicts when services have different values
- Use service-specific formatting (stars, percentages, etc.)

### Rating Input Requirements

- Single decimal input field (0.0-10.0)
- Convert to appropriate service format on submission
- Apply service-specific validation rules
- Handle edge cases (service limits, invalid inputs)

### Conversion Edge Cases

- **Service Limits**: Handle services with different minimum/maximum ratings
- **Precision**: Handle precision differences between services
- **Null Values**: Handle cases where services don't support certain ratings
- **Validation**: Ensure converted values are valid for target service

## Implementation Notes

### Current Issues with Unified Approach

- Single rating shown, unclear which service it's from
- User can't see if services have different ratings
- Unified input but no visibility into per-service state

### Benefits of Per-Service Display

- **Transparency**: User sees exactly what each service has
- **Flexibility**: Can understand service differences
- **Consistency**: Single rating intent applied consistently
- **Learning**: User learns service-specific behaviors

### Success Criteria

- User can see current rating for each service
- User can input single rating that applies to all services
- Conversion happens transparently without preview
- Rating conflicts are clearly visible