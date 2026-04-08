import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminSubmissionsPage from './AdminSubmissionsPage';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    getAllSubmissions: vi.fn(),
    getSubmission: vi.fn(),
    reviewSubmission: vi.fn(),
}));

vi.mock('../lib/useAuth', () => ({
    useAuth: mocks.useAuth,
}));

vi.mock('../lib/api', () => ({
    api: {
        getAllSubmissions: mocks.getAllSubmissions,
        getSubmission: mocks.getSubmission,
        reviewSubmission: mocks.reviewSubmission,
    },
}));

vi.mock('../components/Layout', () => ({
    Navbar: () => <div>Navbar</div>,
    Footer: () => <div>Footer</div>,
}));

describe('AdminSubmissionsPage', () => {
    beforeEach(() => {
        localStorage.clear();
        mocks.useAuth.mockReturnValue({
            user: { id: 'admin-1', profile_complete: true, role: 'admin', admin_access: { can_access_portal: true, is_delegated: false, scopes: [] } },
            isAdmin: true,
            isTeamLead: false,
            canManageOperations: true,
            canAccessAdminPortal: true,
            isDelegatedAdmin: false,
            adminScopes: [],
            hasAdminScope: vi.fn(() => true),
            isLoading: false,
            isAuthenticated: true,
        });
        mocks.getAllSubmissions.mockReset();
        mocks.getSubmission.mockReset();
        mocks.reviewSubmission.mockReset();
    });

    it('loads a submission, opens the review dialog, and marks it as reviewed', async () => {
        mocks.getAllSubmissions.mockResolvedValue([
            {
                id: 'submission-1',
                user_id: 'user-1',
                user_name: 'Taylor',
                week_id: '2026-W12',
                total_hours: 6,
                status: 'submitted',
                submitted_at: '2026-03-17T12:00:00Z',
                has_blockers: true,
            },
        ]);
        mocks.getSubmission.mockResolvedValue({
            id: 'submission-1',
            user_id: 'user-1',
            user_email: 'taylor@example.com',
            user_name: 'Taylor',
            week_id: '2026-W12',
            week_start: '2026-03-16T00:00:00Z',
            week_end: '2026-03-22T00:00:00Z',
            past_work: [{ description: 'Prepared training', hours: 3 }],
            present_work: [{ description: 'Following up with volunteers', hours: 3 }],
            future_work: [{ description: 'Plan next week' }],
            total_hours: 6,
            blockers: 'Waiting on materials',
            notes: 'Needs a quick follow-up',
            status: 'submitted',
            created_at: '2026-03-17T11:00:00Z',
            updated_at: '2026-03-17T11:30:00Z',
            submitted_at: '2026-03-17T12:00:00Z',
            admin_notes: '',
        });
        mocks.reviewSubmission.mockResolvedValue(undefined);

        render(
            <MemoryRouter>
                <AdminSubmissionsPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Taylor')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Review' }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(await screen.findByText(/Submission:/i)).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText('Admin Notes'), 'Looks good to me.');
        await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }));

        await waitFor(() => {
            expect(mocks.reviewSubmission).toHaveBeenCalledWith('submission-1', 'Looks good to me.');
        });
        await waitFor(() => {
            expect(mocks.getAllSubmissions).toHaveBeenCalledTimes(2);
        });
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    it('shows a retry state when loading the queue fails', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.getAllSubmissions.mockRejectedValue(new Error('Queue request failed'));

        render(
            <MemoryRouter>
                <AdminSubmissionsPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Could not load submissions')).toBeInTheDocument();
        expect(screen.getByText('Queue request failed')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

        consoleErrorSpy.mockRestore();
    });
});
