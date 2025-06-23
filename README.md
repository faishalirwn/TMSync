# TMSync

[![Made with TypeScript](https://img.shields.io/badge/Made%20with-TypeScript-007ACC.svg)](https://www.typescriptlang.org/)
[![Built with React](https://img.shields.io/badge/Built%20with-React-61DAFB.svg)](https://reactjs.org/)
[![Styled with Tailwind CSS](https://img.shields.io/badge/Styled%20with-Tailwind%20CSS-38B2AC.svg)](https://tailwindcss.com/)

TMSync is a browser extension designed to seamlessly integrate various streaming websites with your Trakt.tv account. It automates watch history tracking (scrobbling), provides quick access to watch media from Trakt, and enhances the viewing experience with episode highlighting and a built-in commenting/rating system.

## ✨ Core Features

-   **Trakt.tv Authentication:** Securely connect to your Trakt.tv account via OAuth2.
-   **Automatic Scrobbling:** Automatically detects when you're watching a movie or TV show and updates your Trakt history in real-time (start, pause, and stop events).
-   **Intelligent Media Matching:** Uses a combination of TMDB ID lookups and a confidence-based text search to accurately identify the media you are watching.
-   **Manual Control:**
    -   **Manual Search:** If automatic matching fails, a prompt allows you to search Trakt's database and confirm the correct media.
    -   **Undo Scrobble:** Accidentally scrobbled something? Undo it directly from the UI.
-   **Episode Highlighting:** On supported sites, highlights the last watched episode and visually distinguishes watched episodes, making it easy to see where you left off.
-   **Rewatch Support:** Intelligently prompts to track a view as a "rewatch" if the item is already in your history.
-   **In-Page UI:**
    -   **Rating System:** Rate movies, shows, seasons, and episodes directly from the page you're on.
    -   **Comment/Review Modal:** Write and manage your Trakt comments and reviews without leaving the streaming site.
-   **Trakt.tv Quick Links:** Injects convenient "Watch on..." links directly into Trakt.tv pages, allowing you to jump straight to your favorite streaming sites.

## 📺 Supported Sites

-   hexa.watch
-   xprime.tv
-   cineby.app (unmaintained)
-   freek.to (unmaintained)
-   hydrahd.me / hydrahd.ac (unmaintained)

## 🛠️ Tech Stack

-   **Framework:** React 19
-   **Language:** TypeScript
-   **Styling:** Tailwind CSS v4 (using `@theme` for theming)
-   **Bundler:** Webpack
-   **Package Manager:** pnpm
-   **Linting/Formatting:** ESLint & Prettier
-   **Key Architectural Patterns:**
    -   Stateful logic is encapsulated in **Custom Hooks** (`useMediaLifecycle`, `useScrobbling`, `useTraktAuth`).
    -   The background script uses a modular **Handler/Dispatcher Pattern** for message routing.

## 🚀 Getting Started

Follow these instructions to get a local development environment running.

### Prerequisites

-   **Node.js:** This project uses a specific version of Node.js. It's recommended to use a version manager like `nvm`.
    ```bash
    nvm install
    nvm use
    ```
-   **pnpm:** This project uses `pnpm` as its package manager.
    ```bash
    npm install -g pnpm
    ```

### Installation & Setup

1.  **Clone the repository:**

    ```bash
    git clone <your-repository-url>
    cd tmsync
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Configure Environment Variables:**
    You need to provide your Trakt.tv API credentials.
    -   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    -   Edit the `.env` file and fill in your Trakt Client ID and Secret. You can get these by creating a new API App on the [Trakt.tv website](https://trakt.tv/oauth/applications/new).
        ```.env
        TRAKT_CLIENT_ID=your_trakt_client_id
        TRAKT_CLIENT_SECRET=your_trakt_client_secret
        ```

### Development

To run the extension in development mode with live reloading:

```bash
pnpm dev
```

This will watch for file changes and rebuild the extension into the `dist/` directory automatically.

### Production Build

To create an optimized production build:

```bash
pnpm build
```

This will generate the final, minified extension files in the `dist/` directory.

## 📦 Loading the Extension in Your Browser

1.  Navigate to your browser's extension management page:
    -   **Chrome:** `chrome://extensions`
    -   **Firefox:** `about:debugging#/runtime/this-firefox`
2.  Enable "Developer mode" (usually a toggle in the top-right corner).
3.  Click "Load unpacked" (Chrome) or "Load Temporary Add-on..." (Firefox).
4.  Select the `dist` folder from this project's directory.
5.  The TMSync extension should now be installed and active.

## 📂 Project Structure

The project is organized by feature/entry point to improve code co-location and maintainability.

```
/
├── public/                 # Static assets (manifest.json, html shells, icons)
├── src/
│   ├── background/         # Logic for the extension's service worker
│   │   ├── handlers/       # Modular logic for each background message action
│   │   └── index.ts        # Main background entry point and message dispatcher
│   ├── content-scripts/
│   │   ├── main/           # Injected on streaming sites
│   │   │   ├── components/ # React components for the main content script UI
│   │   │   └── index.tsx   # Entry point for the main content script
│   │   └── trakt/          # Injected on trakt.tv
│   │       └── index.tsx   # Entry point for the Trakt content script
│   ├── hooks/              # Shared, reusable React hooks
│   ├── options/            # The React app for the options page
│   ├── popup/              # The React app for the browser action popup
│   ├── styles/             # Global styles and Tailwind configuration
│   ├── types/              # Shared TypeScript type definitions
│   └── utils/              # Shared utilities (API helpers, site configs, etc.)
└── webpack/                # Webpack configuration files
```

## 📝 Architectural Notes

### UI State Management (Custom Hooks)

To avoid "God Components", complex stateful logic is extracted into custom hooks. This keeps components lean and focused on rendering, while the hooks manage the underlying complexity.

-   **`useMediaLifecycle`**: The "controller" hook for the main content script. It's responsible for identifying media on the page, fetching its data from Trakt, and managing the high-level UI state (e.g., showing a "start" vs. "rewatch" prompt).
-   **`useScrobbling`**: A focused hook that manages only the video player interaction and the scrobbling state machine (idle, started, paused).
-   **`useTraktAuth`**: Encapsulates all logic for OAuth authentication, providing a clean interface to log in, log out, and check auth status.

### Background Script (Handler Pattern)

The background script's `onMessage` listener avoids becoming a massive `if/else` block by using a handler pattern. The main `index.ts` file acts as a simple dispatcher that maps message actions to dedicated handler functions located in the `src/background/handlers/` directory. This makes the core logic highly modular, testable, and easy to extend.

### Event Handling and Cross-Extension Conflicts

A significant challenge in this project is preventing keyboard events within the UI (e.g., the Comment Modal) from triggering shortcuts in other installed extensions (like "Video Speed Controller").

The root cause is **Shadow DOM Event Retargeting**. Because our UI is rendered in a Shadow DOM for style isolation, events originating from it have their `target` retargeted to the Shadow Host element when they cross into the main document. This breaks the logic of other extensions that try to inspect the event's origin, causing them to misfire.

The current solution involves a global "guard" listener implemented in `src/content-scripts/main/index.tsx`:

-   It attaches a `keydown` listener to `window` with `{ capture: true }` to run as early as possible.
-   It uses `event.composedPath()` to identify the event's true origin, even from within the Shadow DOM.
-   If the event comes from our UI, `event.stopImmediatePropagation()` is called to prevent any other listeners on the page from receiving it.

**Caveat:** This solution relies on a **race condition**. It works only if our content script loads and attaches its listener before the conflicting extension's script does. A more robust (but complex) solution would involve sandboxing the UI in an `<iframe>`.
