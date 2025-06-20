import React from 'react';

interface StartWatchPromptProps {
    onConfirm: () => void;
}

export const StartWatchPrompt: React.FC<StartWatchPromptProps> = ({
    onConfirm
}) => {
    const mediaText = 'this';

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000000000] bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 animate-fade-in-scale">
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
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
            </svg>
            <span className="text-sm font-medium">
                Start tracking {mediaText}?
            </span>
            <button
                onClick={onConfirm}
                className="bg-(--color-surface-1) text-(--color-accent-primary) hover:bg-(--color-surface-2) font-semibold text-xs px-3 py-1 rounded-full shadow transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-600 focus:ring-(--color-surface-1)"
            >
                Confirm
            </button>
        </div>
    );
};
