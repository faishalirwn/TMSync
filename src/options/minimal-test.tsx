import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initializeServices } from '../services';
import { useMultiServiceAuth } from '../hooks/useMultiServiceAuth';

const MinimalOptions: React.FC = () => {
    useEffect(() => {
        try {
            console.log('Initializing services in minimal test...');
            initializeServices();
            console.log('Services initialized successfully in minimal test');
        } catch (error) {
            console.error(
                'Error initializing services in minimal test:',
                error
            );
        }
    }, []);

    const multiServiceAuth = useMultiServiceAuth();
    console.log('Multi-service auth state:', multiServiceAuth);

    return (
        <div className="p-6 max-w-4xl mx-auto mt-10">
            <h1 className="text-2xl font-bold mb-4">
                TMSync Options (Minimal Test)
            </h1>
            <div className="bg-gray-100 p-4 rounded">
                <h2>
                    Services Initialized:{' '}
                    {multiServiceAuth.isServicesInitialized ? 'Yes' : 'No'}
                </h2>
                <h2>Service Count: {multiServiceAuth.services?.length || 0}</h2>
                <h2>
                    Authenticated:{' '}
                    {multiServiceAuth.authenticatedServices?.length || 0}
                </h2>

                {!multiServiceAuth.isServicesInitialized && (
                    <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded">
                        <p className="text-yellow-800">
                            Waiting for services to initialize...
                        </p>
                    </div>
                )}

                <pre className="mt-2 text-sm">
                    {JSON.stringify(multiServiceAuth, null, 2)}
                </pre>
            </div>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <ErrorBoundary>
            <MinimalOptions />
        </ErrorBoundary>
    );
} else {
    console.error("Target container 'root' not found for Options page.");
}
