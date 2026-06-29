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

    it('dedupes concurrent GET requests for the same endpoint', async () => {
        client.setToken('secret-token');

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({
                id: 'user-1',
                email: 'volunteer@example.com',
                name: 'Volunteer',
                role: 'volunteer',
                is_active: true,
                total_hours: 0,
                total_submissions: 0,
                submission_streak: 0,
                profile_complete: true,
                admin_access: {
                    can_access_portal: false,
                    is_delegated: false,
                    scopes: [],
                },
                created_at: '2026-03-17T00:00:00Z',
                last_login: '2026-03-17T00:00:00Z',
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const [first, second] = await Promise.all([
            client.getCurrentUser(),
            client.getCurrentUser(),
        ]);

        expect(first.email).toBe('volunteer@example.com');
        expect(second.email).toBe('volunteer@example.com');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('invalidates cached user lists after a user update', async () => {
        client.setToken('secret-token');

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify([
                    {
                        id: 'user-1',
                        email: 'volunteer@example.com',
                        name: 'Original User',
                        role: 'volunteer',
                        is_active: true,
                        total_hours: 0,
                        total_submissions: 0,
                        submission_streak: 0,
                        profile_complete: true,
                        admin_access: {
                            can_access_portal: false,
                            is_delegated: false,
                            scopes: [],
                        },
                        created_at: '2026-03-17T00:00:00Z',
                        last_login: '2026-03-17T00:00:00Z',
                    },
                ]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({
                    id: 'user-1',
                    email: 'volunteer@example.com',
                    name: 'Updated User',
                    role: 'volunteer',
                    is_active: true,
                    total_hours: 0,
                    total_submissions: 0,
                    submission_streak: 0,
                    profile_complete: true,
                    admin_access: {
                        can_access_portal: false,
                        is_delegated: false,
                        scopes: [],
                    },
                    created_at: '2026-03-17T00:00:00Z',
                    last_login: '2026-03-17T00:00:00Z',
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify([
                    {
                        id: 'user-1',
                        email: 'volunteer@example.com',
                        name: 'Updated User',
                        role: 'volunteer',
                        is_active: true,
                        total_hours: 0,
                        total_submissions: 0,
                        submission_streak: 0,
                        profile_complete: true,
                        admin_access: {
                            can_access_portal: false,
                            is_delegated: false,
                            scopes: [],
                        },
                        created_at: '2026-03-17T00:00:00Z',
                        last_login: '2026-03-17T00:00:00Z',
                    },
                ]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        await client.getAllUsers({ is_active: true });
        await client.getAllUsers({ is_active: true });
        await client.updateUser('user-1', { name: 'Updated User' });
        const refreshedUsers = await client.getAllUsers({ is_active: true });

        expect(refreshedUsers[0].name).toBe('Updated User');
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('supports week-aware submission requests', async () => {
        client.setToken('secret-token');

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({
                    week_id: '2026-W11',
                    week_start: '2026-03-09T00:00:00',
                    week_end: '2026-03-15T23:59:59',
                    submission_window_start: '2026-03-13T00:00:00',
                    submission_deadline: '2026-03-15T23:59:59',
                    is_submission_window_open: false,
                    allow_late_submissions: true,
                    has_submission: false,
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({
                    id: 'submission-11',
                    user_id: 'user-1',
                    user_email: 'volunteer@example.com',
                    user_name: 'Volunteer',
                    project_id: 'project-1',
                    project_name: 'Food Drive 2026',
                    week_id: '2026-W11',
                    week_start: '2026-03-09T00:00:00',
                    week_end: '2026-03-15T23:59:59',
                    past_work: [],
                    present_work: [],
                    future_work: [],
                    reported_hours: 2,
                    credited_hours: 0,
                    total_hours: 2,
                    status: 'draft',
                    created_at: '2026-03-16T00:00:00Z',
                    updated_at: '2026-03-16T00:00:00Z',
                    submitted_at: null,
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const weekInfo = await client.getCurrentWeekInfo('2026-W11');
        const submission = await client.createOrUpdateSubmission({
            project_id: 'project-1',
            week_id: '2026-W11',
            past_work: [{ description: 'Catch-up outreach', hours: 2 }],
            present_work: [],
            future_work: [],
        });

        expect(weekInfo.week_id).toBe('2026-W11');
        expect(submission.week_id).toBe('2026-W11');
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://localhost:8081/api/v1/submissions/current-week?week_id=2026-W11',
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://localhost:8081/api/v1/submissions',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    project_id: 'project-1',
                    week_id: '2026-W11',
                    past_work: [{ description: 'Catch-up outreach', hours: 2 }],
                    present_work: [],
                    future_work: [],
                }),
            }),
        );
    });
});
