import React from 'react';

interface RewatchPromptProps {
    onConfirm: () => void;
}

export const RewatchPrompt: React.FC<RewatchPromptProps> = ({ onConfirm }) => {
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000000000] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 animate-fade-in-scale">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m-15.357-2a8.001 8.001 0 0015.357 2M9 21H4.581"
                />
            </svg>
            <span className="text-sm font-medium">
                Track this as a rewatch?
            </span>
            <button
                onClick={onConfirm}
                className="bg-(--color-surface-1) text-(--color-accent-secondary) hover:bg-(--color-surface-2) font-semibold text-xs px-3 py-1 rounded-full shadow transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-purple-600 focus:ring-(--color-surface-1)"
            >
                Confirm Rewatch
            </button>
        </div>
    );
};
