import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

const Popup: React.FC = () => {
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [username, setUsername] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const checkStatus = useCallback(async () => {
        try {
            const data = await chrome.storage.local.get([
                'traktAccessToken',
                'traktTokenExpiresAt',
                'traktUsername'
            ]);
            const token = data.traktAccessToken;
            const expires = data.traktTokenExpiresAt || 0;
            const name = data.traktUsername;

            if (token && Date.now() < expires && name) {
                setIsLoggedIn(true);
                setUsername(name);
            } else {
                setIsLoggedIn(false);
                setUsername(null);
            }
        } catch (err) {
            console.error('Error checking status in popup:', err);
            setIsLoggedIn(false);
            setUsername(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        checkStatus();

        const handleStorageChange = (
            changes: { [key: string]: chrome.storage.StorageChange },
            areaName: string
        ) => {
            if (
                areaName === 'local' &&
                (changes.traktAccessToken ||
                    changes.traktTokenExpiresAt ||
                    changes.traktUsername)
            ) {
                console.log('Detected storage change, re-checking status...');
                checkStatus();
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, [checkStatus]);

    const openOptionsPage = () => {
        chrome.runtime.openOptionsPage();
    };

    return (
        <div className="p-4 bg-white rounded-md shadow min-w-[280px] text-sm">
            <h1 className="text-lg font-semibold text-center mb-3 text-gray-800">
                TMSync
            </h1>

            {isLoading ? (
                <div className="flex justify-center items-center h-10">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
                </div>
            ) : isLoggedIn && username ? (
                <div className="text-center space-y-2">
                    <p className="text-green-700">
                        Logged in as:{' '}
                        <strong className="font-medium">{username}</strong>
                    </p>
                </div>
            ) : (
                <p className="text-center text-red-700">Not logged in.</p>
            )}

            <button
                onClick={openOptionsPage}
                className="mt-4 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded text-xs focus:outline-none focus:shadow-outline transition duration-150 ease-in-out"
            >
                {isLoggedIn ? 'Open Settings' : 'Login / Open Settings'}
            </button>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
} else {
    console.error("Target container 'root' not found for Popup.");
}
