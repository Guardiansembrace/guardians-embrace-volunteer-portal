/**
 * Logger utility for Guardian's Embrace Volunteer Portal.
 * 
 * Provides a standardized way to log across the frontend, 
 * with built-in production vs development environment handling
 * and automatic reporting of errors to backend monitoring.
 */

import { reportAppError } from './monitoring';

class Logger {
    private isProd = import.meta.env.PROD;

    /**
     * Log debug information - only visible in development
     */
    debug(message: string, ...args: any[]) {
        if (!this.isProd) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }

    /**
     * Log general information - only visible in development
     */
    info(message: string, ...args: any[]) {
        if (!this.isProd) {
            console.info(`[INFO] ${message}`, ...args);
        }
    }

    /**
     * Log warnings - visible in all environments
     */
    warn(message: string, ...args: any[]) {
        console.warn(`[WARN] ${message}`, ...args);
    }

    /**
     * Log errors - visible in all environments and reported to backend monitoring
     */
    error(message: string | unknown, error?: unknown, context?: Record<string, unknown>) {
        const errorMsg = typeof message === 'string' ? message : 'An error occurred';
        const actualError = error || (typeof message !== 'string' ? message : undefined);
        
        // Always log to console for developer visibility
        console.error(`[ERROR] ${errorMsg}`, actualError);
        
        // Report to backend monitoring
        void reportAppError(actualError || errorMsg, {
            severity: 'error',
            context: {
                user_message: errorMsg,
                ...context
            }
        });
    }
}

export const logger = new Logger();
export default logger;
