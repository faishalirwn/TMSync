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
- Copy `.env.example` to `.env` and configure Trakt.tv API credentials
- Required variables: `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`

## Project Architecture

TMSync is a Chrome extension that integrates streaming sites with Trakt.tv for automatic scrobbling and watch tracking.

### Core Architecture Patterns

**Message Handler Pattern (Background Script)**:
- Background script at `src/background/index.ts` uses a dispatcher pattern
- Message handlers are modular functions in `src/background/handlers/`
- Each handler corresponds to a specific action (scrobble, rate, comment, etc.)

**Custom Hook Pattern (React Components)**:
- Complex stateful logic is extracted into custom hooks to avoid "God Components"
- Key hooks:
  - `useMediaLifecycle`: Main controller for media detection, identification, and UI state management
  - `useScrobbling`: Manages video player interaction and scrobbling state machine
  - `useTraktAuth`: Handles OAuth authentication with Trakt.tv

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
- `src/types/messaging.ts`: Message passing between content scripts and background
- `src/types/scrobbling.ts`: Scrobbling state and progress tracking
- `src/types/trakt.ts`: Trakt.tv API response structures

### Extension Structure

**Entry Points**:
- Background script: `src/background/index.ts`
- Main content script: `src/content-scripts/main/index.tsx`
- Trakt content script: `src/content-scripts/trakt/index.tsx`
- Options page: `src/options/index.tsx`
- Popup: `src/popup/index.tsx`

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

**Event Handling Conflicts**:
The extension uses a global keydown event guard to prevent conflicts with other extensions. This relies on timing - the extension's event listener must attach before conflicting extensions. A more robust solution would use iframe sandboxing.

**Media Detection Flow**:
1. Site config detects media type and extracts metadata
2. Background script queries Trakt.tv API for media information
3. Custom hook processes response and determines UI state
4. User confirms or manually selects media if confidence is low
5. Scrobbling begins once media is confirmed

**State Management**:
- React component state managed through custom hooks
- Extension-wide state (scrobbling status) managed in background script
- Local storage used for rewatch tracking and user preferences

## Development Roadmap

**Phase 1: Development Infrastructure & Best Practices** ✅ COMPLETED
- Comprehensive package.json scripts for development workflow
- Vitest testing framework with Chrome extension mocks
- Pre-commit hooks with Husky + lint-staged for code quality
- Enhanced TypeScript configuration with stricter settings
- GitHub Actions CI/CD pipeline for automated testing and releases

**Phase 2: Multi-Service Architecture Foundation** 🚧 NEXT
- Create TrackerService interface defining common operations
- Implement service-specific classes (TraktService, AnilistService, MalService)
- Add service configuration management for API keys and settings
- Create MediaIdentifier service for cross-service mapping
- Implement confidence scoring for media matching
- Add database mapping utilities for episode/season reconciliation

**Phase 3: UI/UX Multi-Service Integration**
- Refactor rating system with service-specific translation
- Create service-aware comment/notes system
- Add multi-service status indicators
- Implement service-specific confirmation prompts

**Phase 4: Advanced Features & Edge Cases**
- Implement EpisodeMapper service for complex show structures
- Add crowd-sourced mapping support
- Create user-driven corrections and community validation