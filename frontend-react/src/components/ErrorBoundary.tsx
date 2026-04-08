import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportAppError } from '../lib/monitoring';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        void reportAppError(error, {
            componentStack: errorInfo.componentStack,
            context: {
                source: 'react-error-boundary',
            },
        });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    padding: '2rem',
                    textAlign: 'center'
                }}>
                    <h1>Something went wrong.</h1>
                    <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem', maxWidth: '500px' }}>
                        An unexpected error occurred in the application. Please try refreshing the page or contact support if the issue persists.
                    </p>
                    <button
                        className="btn btn-primary"
                        onClick={() => window.location.reload()}
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
