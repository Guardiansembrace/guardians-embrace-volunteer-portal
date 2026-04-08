/**
 * API Configuration for Guardians Portal Frontend
 */

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
    if (value === undefined || value === '') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const apiProtocol = import.meta.env.VITE_API_PROTOCOL || 'http';
const apiHost = import.meta.env.VITE_API_HOST || 'localhost';
const apiPort = import.meta.env.VITE_API_PORT || '8081';

export const API_BASE_URL =
    import.meta.env.VITE_API_URL || `${apiProtocol}://${apiHost}${apiPort ? `:${apiPort}` : ''}`;
export const API_PREFIX = '/api/v1';
export const API_URL = `${API_BASE_URL}${API_PREFIX}`;

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const MONITORING_ENABLED = parseBooleanEnv(import.meta.env.VITE_MONITORING_ENABLED, true);
export const APP_RELEASE = import.meta.env.VITE_APP_VERSION || import.meta.env.MODE || 'development';
