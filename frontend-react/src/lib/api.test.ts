import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';

describe('ApiClient', () => {
    let client: ApiClient;
    let redirectSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        redirectSpy = vi.fn();
        client = new ApiClient(redirectSpy);
        localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('stores the auth token after Google login', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({
                access_token: 'jwt-token',
                token_type: 'bearer',
                user: {
                    id: 'user-1',
                    email: 'volunteer@example.com',
                    name: 'Volunteer',
                    role: 'volunteer',
                    is_active: true,
                    total_hours: 0,
                    total_submissions: 0,
                    submission_streak: 0,
                    created_at: '2026-03-17T00:00:00Z',
                    last_login: '2026-03-17T00:00:00Z',
                    profile_complete: true,
                },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const response = await client.loginWithGoogle('google-token');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8081/api/v1/auth/google',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ access_token: 'google-token' }),
            }),
        );
        expect(response.access_token).toBe('jwt-token');
        expect(localStorage.getItem('auth_token')).toBe('jwt-token');
    });

    it('serializes query params and includes the bearer token', async () => {
        client.setToken('secret-token');

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await client.getAllUsers({ page: 2, active: true, team: undefined });

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8081/api/v1/users?page=2&active=true',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer secret-token',
                    'Content-Type': 'application/json',
                }),
            }),
        );
    });

    it('clears the token and redirects to login on unauthorized responses', async () => {
        client.setToken('expired-token');

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ detail: 'Expired token' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(client.getCurrentUser()).rejects.toThrow('Expired token');

        expect(localStorage.getItem('auth_token')).toBeNull();
        expect(redirectSpy).toHaveBeenCalledWith('/login');
    });
});
