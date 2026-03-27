import { API_URL, APP_RELEASE, MONITORING_ENABLED } from './config';

type Severity = 'error' | 'warning';

interface ErrorContext {
    [key: string]: unknown;
}

interface ReportOptions {
    severity?: Severity;
    componentStack?: string | null;
    context?: ErrorContext;
}

const recentReports = new Map<string, number>();
const REPORT_DEDUP_WINDOW_MS = 5000;
let globalHandlersInstalled = false;
let isSendingReport = false;

function buildSessionId() {
    const existing = sessionStorage.getItem('monitoring_session_id');
    if (existing) return existing;

    const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    sessionStorage.setItem('monitoring_session_id', generated);
    return generated;
}

function normalizeError(error: unknown) {
    if (error instanceof Error) {
        return {
            message: error.message || 'Unknown frontend error',
            stack: error.stack,
        };
    }

    if (typeof error === 'string') {
        return { message: error, stack: undefined };
    }

    return {
        message: 'Unknown frontend error',
        stack: JSON.stringify(error),
    };
}

function shouldSkipReport(fingerprint: string) {
    const now = Date.now();
    const previous = recentReports.get(fingerprint);
    recentReports.set(fingerprint, now);

    for (const [key, timestamp] of recentReports.entries()) {
        if (now - timestamp > REPORT_DEDUP_WINDOW_MS) {
            recentReports.delete(key);
        }
    }

    return previous !== undefined && now - previous < REPORT_DEDUP_WINDOW_MS;
}

export async function reportAppError(error: unknown, options: ReportOptions = {}) {
    if (!MONITORING_ENABLED || typeof window === 'undefined' || typeof fetch === 'undefined' || isSendingReport) {
        return;
    }

    const normalized = normalizeError(error);
    const fingerprint = `${normalized.message}:${normalized.stack || ''}:${options.componentStack || ''}`;
    if (shouldSkipReport(fingerprint)) {
        return;
    }

    isSendingReport = true;

    try {
        const token = localStorage.getItem('auth_token');
        await fetch(`${API_URL}/monitoring/frontend-errors`, {
            method: 'POST',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                message: normalized.message,
                severity: options.severity || 'error',
                stack: normalized.stack,
                component_stack: options.componentStack ?? undefined,
                url: window.location.href,
                route: window.location.pathname,
                user_agent: window.navigator.userAgent,
                release: APP_RELEASE,
                environment: import.meta.env.MODE,
                session_id: buildSessionId(),
                context: options.context || {},
            }),
        });
    } catch (reportingError) {
        console.error('Failed to report frontend error', reportingError);
    } finally {
        isSendingReport = false;
    }
}

export function installGlobalErrorHandlers() {
    if (!MONITORING_ENABLED || typeof window === 'undefined' || globalHandlersInstalled) {
        return;
    }

    window.addEventListener('error', (event) => {
        void reportAppError(event.error || event.message, {
            severity: 'error',
            context: {
                source: 'window.error',
                filename: event.filename,
                line: event.lineno,
                column: event.colno,
            },
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        void reportAppError(event.reason, {
            severity: 'error',
            context: {
                source: 'window.unhandledrejection',
            },
        });
    });

    globalHandlersInstalled = true;
}
