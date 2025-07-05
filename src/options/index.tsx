import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthenticationHub } from '../components/AuthenticationHub';
import { ServiceControlPanel } from '../components/ServiceControlPanel';
import { useMultiServiceAuth } from '../hooks/useMultiServiceAuth';
import { useQuickLinkPreferences } from '../hooks/useQuickLinkPreferences';
import { UserQuickLinkPrefs } from '../hooks/useQuickLinkPreferences';
import { initializeServices } from '../services';

export type { UserQuickLinkPrefs };

const Options: React.FC = () => {
    // Initialize services on component mount
    useEffect(() => {
        try {
            console.log('Initializing services...');
            initializeServices();
            console.log('Services initialized successfully');
        } catch (error) {
            console.error('Error initializing services:', error);
        }
    }, []);

    const { hasAnyAuthenticated, isServicesInitialized } =
        useMultiServiceAuth();
    const {
        prefs,
        isLoading: isLoadingPrefs,
        searchTerm,
        setSearchTerm,
        filteredSites,
        toggleSite,
        moveSite
    } = useQuickLinkPreferences(hasAnyAuthenticated && isServicesInitialized);

    return (
        <div className="bg-(--color-background) text-(--color-text-primary) min-h-screen">
            <div className="p-6 max-w-4xl mx-auto mt-10 space-y-8">
                <div className="bg-(--color-surface-1) rounded-lg shadow-md p-6">
                    <h1 className="text-2xl font-bold text-center mb-6 text-(--color-text-primary)">
                        TMSync Options
                    </h1>

                    {/* Authentication Hub */}
                    <AuthenticationHub />
                </div>

                {/* Service Control Panel */}
                {isServicesInitialized && <ServiceControlPanel />}

                {hasAnyAuthenticated && isServicesInitialized && (
                    <div className="bg-(--color-surface-1) rounded-lg shadow-md p-6">
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
    root.render(
        <ErrorBoundary>
            <Options />
        </ErrorBoundary>
    );
} else {
    console.error("Target container 'root' not found for Options page.");
}
