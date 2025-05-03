import React from 'react';

interface LoadingIndicatorProps {
    text?: string;
    size?: 'small' | 'medium' | 'large';
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
    text = 'Loading...',
    size = 'medium'
}) => {
    const sizeClasses = {
        small: 'w-4 h-4 border-2',
        medium: 'w-6 h-6 border-4',
        large: 'w-8 h-8 border-4'
    };

    return (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1000000000] flex items-center justify-center space-x-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-md shadow">
            <div
                className={`animate-spin rounded-full border-t-blue-500 border-r-blue-500 border-b-blue-200 border-l-blue-200 ${sizeClasses[size]}`}
                role="status"
            >
                <span className="sr-only">{text}</span>{' '}
            </div>
            {text && <span className="text-sm text-gray-700">{text}</span>}
        </div>
    );
};
