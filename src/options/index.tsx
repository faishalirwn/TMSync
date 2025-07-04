import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { useTraktAuth } from '../hooks/useTraktAuth';
import { useQuickLinkPreferences } from '../hooks/useQuickLinkPreferences';
import { UserQuickLinkPrefs } from '../hooks/useQuickLinkPreferences';

export type { UserQuickLinkPrefs };

const Options: React.FC = () => {
    const { isLoggedIn, username, isLoading, error, login, logout } =
        useTraktAuth();
    const {
        prefs,
        isLoading: isLoadingPrefs,
        searchTerm,
        setSearchTerm,
        filteredSites,
        toggleSite,
        moveSite
    } = useQuickLinkPreferences(isLoggedIn);

    return (
        <div className="bg-(--color-background) text-(--color-text-primary) min-h-screen">
            <div className="p-6 max-w-md mx-auto mt-10 bg-(--color-surface-1) rounded-lg shadow-md">
                <h1 className="text-2xl font-bold text-center mb-6 text-(--color-text-primary)">
                    TMSync Options
                </h1>

                {isLoading ? (
                    <div className="flex justify-center items-center h-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-(--color-accent-primary)"></div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {error && (
                            <div
                                className="bg-red-900/30 border border-red-500/50 text-(--color-danger-text) px-4 py-3 rounded relative"
                                role="alert"
                            >
                                <strong className="font-bold">Error:</strong>
                                <span className="block sm:inline ml-2">
                                    {error}
                                </span>
                            </div>
                        )}

                        {isLoggedIn && username ? (
                            <div className="text-center">
                                <p className="text-lg text-(--color-success-text)">
                                    Logged in as:{' '}
                                    <strong className="font-semibold">
                                        {username}
                                    </strong>
                                </p>
                                <button
                                    onClick={logout}
                                    className="mt-4 w-full bg-(--color-danger) hover:bg-(--color-danger-hover) text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150 ease-in-out"
                                >
                                    Logout from Trakt.tv
                                </button>
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className="text-(--color-text-secondary) mb-4">
                                    Connect your Trakt.tv account to sync your
                                    watch history.
                                </p>
                                <button
                                    onClick={login}
                                    className="w-full bg-(--color-accent-primary) hover:bg-(--color-accent-primary-hover) text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150 ease-in-out"
                                >
                                    Login with Trakt.tv
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {isLoggedIn && (
                    <div className="mt-8 pt-6 border-t border-(--color-border)">
                        <h2 className="text-xl font-semibold mb-4 text-(--color-text-primary)">
                            Quick Links on Trakt.tv
                        </h2>
                        {isLoadingPrefs ? (
                            <p>Loading preferences...</p>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    placeholder="Search sites..."
                                    className="w-full p-2 border border-(--color-border) rounded mb-4 bg-(--color-background) text-(--color-text-primary) focus:ring-2 focus:ring-(--color-accent-primary) focus:outline-none"
                                    value={searchTerm}
                                    onChange={(e) =>
                                        setSearchTerm(e.target.value)
                                    }
                                />
                                <ul className="space-y-2">
                                    {filteredSites.map((site, index, arr) => (
                                        <li
                                            key={site.key}
                                            className="flex items-center justify-between p-3 bg-(--color-surface-2) rounded-md shadow-sm"
                                        >
                                            <div className="flex items-center">
                                                <img
                                                    src={site.logo}
                                                    alt={site.name}
                                                    className="w-5 h-5 mr-3 object-contain"
                                                />
                                                <span className="text-(--color-text-primary)">
                                                    {site.name}
                                                </span>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <button
                                                    onClick={() =>
                                                        moveSite(site.key, 'up')
                                                    }
                                                    disabled={
                                                        prefs[site.key]
                                                            ?.order === 0
                                                    }
                                                    className="text-xs p-1 disabled:opacity-50"
                                                >
                                                    ⬆️
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        moveSite(
                                                            site.key,
                                                            'down'
                                                        )
                                                    }
                                                    disabled={
                                                        prefs[site.key]
                                                            ?.order ===
                                                        arr.length - 1
                                                    }
                                                    className="text-xs p-1 disabled:opacity-50"
                                                >
                                                    ⬇️
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        toggleSite(site.key)
                                                    }
                                                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out focus:outline-none
                                                    ${prefs[site.key]?.enabled ? 'bg-(--color-accent-primary)' : 'bg-(--color-surface-3)'}`}
                                                >
                                                    <span
                                                        className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out
                                                        ${prefs[site.key]?.enabled ? 'translate-x-6' : 'translate-x-0'}`}
                                                    />
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Options />);
} else {
    console.error("Target container 'root' not found for Options page.");
}
