import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportAppError } from './monitoring';

describe('frontend monitoring', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reports frontend errors to the backend monitoring endpoint', async () => {
        localStorage.setItem('auth_token', 'jwt-token');
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ accepted: true }), {
                status: 202,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await reportAppError(new Error('Dashboard exploded'), {
            context: { source: 'unit-test' },
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8081/api/v1/monitoring/frontend-errors',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer jwt-token',
                    'Content-Type': 'application/json',
                }),
            }),
        );

        const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(body.message).toBe('Dashboard exploded');
        expect(body.context.source).toBe('unit-test');
        expect(body.session_id).toBeTruthy();
    });
});
