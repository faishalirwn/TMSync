# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Package Manager**: Use `pnpm` for all package management operations.

**Build & Development**:
- `pnpm dev` - Run development build with file watching
- `pnpm build` - Create production build
- `pnpm clean` - Remove dist directory

**Quality & Testing**:
- `pnpm format` - Auto-format all code with Prettier
- `pnpm lint` - Run ESLint with auto-fix
- `pnpm lint:check` - Check linting without fixing
- `pnpm type-check` - TypeScript type checking
- `pnpm test` - Run tests with Vitest
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm test:ui` - Run tests with UI interface
- `pnpm check-all` - Run all quality checks
- `pnpm fix-all` - Auto-fix all issues possible

**Environment Setup**:
- Copy `.env.example` to `.env` and configure tracking service API credentials
- **Trakt.tv**: `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`
- **AniList**: `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET` (optional - for AniList integration)
- Services can be enabled/disabled individually based on available credentials

## Project Architecture

TMSync is a Chrome extension that integrates streaming sites with multiple tracking services (Trakt.tv, AniList) for automatic scrobbling and watch tracking. The extension features a multi-service architecture that can support multiple tracking services simultaneously.

### Core Architecture Patterns

**Multi-Service Architecture Pattern**:
- `TrackerService` interface defines common operations for all tracking services
- Service-specific implementations: `TraktService`, `AniListService` 
- `ServiceRegistry` manages multiple services with priority and capability filtering
- Service-agnostic types (`ServiceComment`, `ServiceProgressInfo`, `ServiceMediaRatings`) abstract away service differences

**Message Handler Pattern (Background Script)**:
- Background script at `src/background/index.ts` uses a dispatcher pattern
- Message handlers are modular functions in `src/background/handlers/`
- Each handler corresponds to a specific action (scrobble, rate, comment, etc.)
- Handlers use service-agnostic types for multi-service compatibility

**Custom Hook Pattern (React Components)**:
- Complex stateful logic is extracted into custom hooks to avoid "God Components"
- Key hooks:
  - `useMediaLifecycle`: Main controller for media detection, identification, and UI state management (uses service-agnostic types)
  - `useScrobbling`: Manages video player interaction and scrobbling state machine (works with multiple services)
  - `useTraktAuth`: Handles OAuth authentication with Trakt.tv (service-specific authentication hook)

**Site Configuration Pattern**:
- Each supported streaming site has a configuration class in `src/utils/siteConfigs/`
- Base configuration interface in `baseConfig.ts`
- Site-specific implementations (hexa.ts, xprime.ts, etc.) extend base config

### Key Components

**Content Scripts**:
- `src/content-scripts/main/`: Injected into streaming sites for scrobbling
- `src/content-scripts/trakt/`: Injected into Trakt.tv pages for quick links

**Background State Management**:
- Global scrobbling state managed in `src/background/state.ts`
- Handles tab close/navigation events to properly stop scrobbles

**Shadow DOM Implementation**:
- UI components use Shadow DOM for style isolation
- Critical event handling guard in `src/content-scripts/main/index.tsx` prevents conflicts with other extensions

### TypeScript Types

**Key Type Definitions**:
- `src/types/media.ts`: Media information, ratings, and episode structures
- `src/types/messaging.ts`: Message passing between content scripts and background (uses service-agnostic types)
- `src/types/scrobbling.ts`: Scrobbling state and progress tracking
- `src/types/services.ts`: TrackerService interface and ServiceRegistry definitions
- `src/types/serviceTypes.ts`: Service-agnostic types for multi-service compatibility
- `src/types/trakt.ts`: Trakt.tv API response structures

### Extension Structure

**Entry Points**:
- Background script: `src/background/index.ts`
- Main content script: `src/content-scripts/main/index.tsx`
- Trakt content script: `src/content-scripts/trakt/index.tsx`
- Options page: `src/options/index.tsx`
- Popup: `src/popup/index.tsx`

**Service Architecture**:
- Service implementations: `src/services/TraktService.ts`, `src/services/AniListService.ts`
- Service management: `src/services/ServiceRegistry.ts`
- Service initialization: `src/services/index.ts`
- Multi-service test: `src/test-services.ts`

**Build Configuration**:
- Webpack configuration in `webpack/` directory
- TypeScript configuration in `tsconfig.json`
- Manifest and static assets in `public/`

## Development Notes

**Commit Strategy**:
- Commit changes in logical, meaningful chunks
- Each commit should represent a complete, understandable feature or fix
- Use descriptive commit messages explaining the "why" not just "what"
- This creates checkpoints for easy reverting and better code review

**Current Commit Recommendation**:
The multi-service architecture foundation (Phase 2) has been completed and should be committed as a single comprehensive commit. This represents a major architectural milestone with:
- Complete TrackerService interface implementation
- TraktService and AniListService with full interface compliance
- Service-agnostic type system
- Updated handlers and components for multi-service compatibility

**Event Handling Conflicts**:
The extension uses a global keydown event guard to prevent conflicts with other extensions. This relies on timing - the extension's event listener must attach before conflicting extensions. A more robust solution would use iframe sandboxing.

**Media Detection Flow**:
1. Site config detects media type and extracts metadata
2. Background script queries tracking service APIs (Trakt.tv, AniList) for media information
3. ServiceRegistry determines which services can handle the media type
4. Custom hook processes service responses and determines UI state
5. User confirms or manually selects media if confidence is low
6. Scrobbling begins once media is confirmed, using appropriate services based on capabilities

**State Management**:
- React component state managed through custom hooks
- Extension-wide state (scrobbling status) managed in background script
- Local storage used for rewatch tracking and user preferences
- Multi-service state managed through ServiceRegistry with priority-based service selection

**Multi-Service Architecture Guidelines**:
- All new handlers should use service-agnostic types (ServiceComment, ServiceProgressInfo, etc.)
- Use ServiceRegistry to get services with specific capabilities rather than direct service imports
- When adding new features, implement them in the TrackerService interface first
- Service-specific implementations should convert their native types to service-agnostic types
- Test multi-service functionality using `npx tsx src/test-services.ts`
- Run `npm run type-check` after any service-related changes to ensure interface compliance
- Each service should handle its own authentication and error states gracefully

## Development Roadmap

**Phase 1: Development Infrastructure & Best Practices** ✅ COMPLETED
- Comprehensive package.json scripts for development workflow
- Vitest testing framework with Chrome extension mocks
- Pre-commit hooks with Husky + lint-staged for code quality
- Enhanced TypeScript configuration with stricter settings
- GitHub Actions CI/CD pipeline for automated testing and releases

**Phase 2: Multi-Service Architecture Foundation** ✅ COMPLETED
- ✅ Created TrackerService interface defining common operations for all tracking services
- ✅ Implemented TraktService class with full TrackerService interface compliance
- ✅ Implemented AniListService class with TrackerService interface (GraphQL API integration)
- ✅ Created ServiceRegistry for managing multiple services with priority and capability filtering
- ✅ Added service-agnostic types (ServiceComment, ServiceProgressInfo, ServiceMediaRatings, etc.)
- ✅ Updated all handlers and components to use service-agnostic types
- ✅ Created service initialization and testing infrastructure
- 🔄 Service configuration management for API keys and settings (partial - basic OAuth flows implemented)
- 📋 Create MediaIdentifier service for cross-service mapping (deferred to Phase 4)
- 📋 Implement confidence scoring for media matching (deferred to Phase 4)
- 📋 Add database mapping utilities for episode/season reconciliation (deferred to Phase 4)

**Phase 3: UI/UX Multi-Service Integration** 🚧 NEXT
- ✅ Refactor rating system with service-specific translation (basic implementation completed)
- ✅ Create service-aware comment/notes system (completed with ServiceComment type)
- 📋 Add multi-service status indicators in UI
- 📋 Implement service-specific confirmation prompts
- 📋 Add service selection and configuration in options page
- 📋 Create multi-service authentication management UI
- 📋 Add service-specific error handling and user feedback

**Phase 4: Advanced Features & Edge Cases**
- Implement EpisodeMapper service for complex show structures
- Create MediaIdentifier service for cross-service mapping
- Implement confidence scoring for media matching across services
- Add database mapping utilities for episode/season reconciliation
- Add crowd-sourced mapping support
- Create user-driven corrections and community validation
- Implement MyAnimeList service integration
- Add service-specific media type handling (anime/manga support)
- Create conflict resolution for differing service data