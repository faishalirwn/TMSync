import React from 'react';

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
    errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error boundary caught an error:', error);
        console.error('Error info:', errorInfo);
        this.setState({
            error,
            errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 max-w-4xl mx-auto mt-10">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                        <h2 className="text-xl font-bold text-red-800 mb-4">
                            Something went wrong
                        </h2>
                        <div className="text-red-700 space-y-2">
                            <p>
                                <strong>Error:</strong>{' '}
                                {this.state.error?.message}
                            </p>
                            <details className="mt-4">
                                <summary className="cursor-pointer font-semibold">
                                    Technical Details
                                </summary>
                                <pre className="mt-2 p-3 bg-red-100 rounded text-sm overflow-auto">
                                    {this.state.error?.stack}
                                </pre>
                                {this.state.errorInfo && (
                                    <pre className="mt-2 p-3 bg-red-100 rounded text-sm overflow-auto">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </details>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
