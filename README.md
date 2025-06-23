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

-   cineby.app
-   freek.to
-   hydrahd.me / hydrahd.ac
-   hexa.watch
-   xprime.tv
-   _(and various embedded players)_

## 🛠️ Tech Stack

-   **Framework:** React 19
-   **Language:** TypeScript
-   **Styling:** Tailwind CSS v4 (using `@theme` for theming)
-   **Bundler:** Webpack
-   **Package Manager:** pnpm
-   **Linting/Formatting:** ESLint & Prettier

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

```
/
├── public/               # Static assets (manifest.json, html shells, icons)
├── src/                  # Main source code
│   ├── components/       # React components (UI)
│   ├── styles/           # Global styles and Tailwind config
│   ├── utils/            # Helpers, API clients, site configs, types
│   ├── background.ts     # Extension service worker (core logic)
│   ├── contentScript.tsx # Injects UI onto streaming sites
│   └── traktContentScript.tsx # Injects UI onto Trakt.tv
└── webpack/              # Webpack configuration files
```

## 📝 Architectural Notes

### Event Handling and Cross-Extension Conflicts

A significant challenge in this project is preventing keyboard events within the UI (e.g., the Comment Modal) from triggering shortcuts in other installed extensions (like "Video Speed Controller").

The root cause is **Shadow DOM Event Retargeting**. Because our UI is rendered in a Shadow DOM for style isolation, events originating from it have their `target` retargeted to the Shadow Host element when they cross into the main document. This breaks the logic of other extensions that try to inspect the event's origin, causing them to misfire.

The current solution involves a global "guard" listener implemented in `src/contentScript.tsx`:

-   It attaches a `keydown` listener to `window` with `{ capture: true }` to run as early as possible.
-   It uses `event.composedPath()` to identify the event's true origin, even from within the Shadow DOM.
-   If the event comes from our UI, `event.stopImmediatePropagation()` is called to prevent any other listeners on the page from receiving it.

**Caveat:** This solution relies on a **race condition**. It works only if our content script loads and attaches its listener before the conflicting extension's script does. A more robust (but complex) solution would involve sandboxing the UI in an `<iframe>`.
