import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AdminDashboardPage from './AdminDashboardPage';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    getUserStats: vi.fn(),
    getSubmissionStats: vi.fn(),
    getProjects: vi.fn(),
    getEmailStatus: vi.fn(),
    getAuditLogs: vi.fn(),
    sendReminders: vi.fn(),
}));

vi.mock('../lib/useAuth', () => ({
    useAuth: mocks.useAuth,
}));

vi.mock('../lib/api', () => ({
    api: {
        getUserStats: mocks.getUserStats,
        getSubmissionStats: mocks.getSubmissionStats,
        getProjects: mocks.getProjects,
        getEmailStatus: mocks.getEmailStatus,
        getAuditLogs: mocks.getAuditLogs,
        sendReminders: mocks.sendReminders,
    },
}));

vi.mock('../components/Layout', () => ({
    Navbar: () => <div>Navbar</div>,
    Footer: () => <div>Footer</div>,
}));

describe('AdminDashboardPage shortcuts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useAuth.mockReturnValue({
            isAdmin: true,
            canAccessAdminPortal: true,
            hasAdminScope: vi.fn((scope: string) => ['view_users', 'review_submissions', 'manage_projects'].includes(scope)),
            isDelegatedAdmin: false,
            isLoading: false,
            isAuthenticated: true,
        });
        mocks.getUserStats.mockResolvedValue({
            total_users: 33,
            active_users: 33,
            volunteers: 30,
            inactive_users: 2,
        });
        mocks.getSubmissionStats.mockResolvedValue({
            week_id: '2026-W15',
            this_week: {
                total_drafts: 4,
                total_submitted: 9,
                total_hours: 24,
                blockers_count: 1,
            },
            all_time: {
                total_submissions: 40,
            },
        });
        mocks.getProjects.mockResolvedValue([{ id: 'project-1' }]);
        mocks.getEmailStatus.mockResolvedValue({ configured: true });
        mocks.getAuditLogs.mockResolvedValue([]);
        mocks.sendReminders.mockResolvedValue({ success: true, message: 'Sent.' });
    });

    it('renders admin metric cards as navigation shortcuts', async () => {
        render(
            <MemoryRouter initialEntries={['/admin']}>
                <AdminDashboardPage />
            </MemoryRouter>,
        );

        const blockersLink = await screen.findByRole('link', { name: /Blockers Reported: 1\. Open blockers queue/i });
        const draftsLink = screen.getByRole('link', { name: /Drafts Open: 4\. Review open drafts/i });
        const submittedLink = screen.getByRole('link', { name: /Submitted this Week: 9\. Open this week's queue/i });
        const inactiveUsersLink = screen.getByRole('link', { name: /Inactive Volunteers: 2\. Open user directory/i });
        const activeProjectsLink = screen.getByRole('link', { name: /Active Projects: 1\. Open project boards/i });

        expect(blockersLink).toHaveAttribute('href', '/admin/submissions?view=blockers&week=2026-W15');
        expect(draftsLink).toHaveAttribute('href', '/admin/submissions?view=drafts&week=2026-W15&status=draft');
        expect(submittedLink).toHaveAttribute('href', '/admin/submissions?view=all&week=2026-W15&status=submitted');
        expect(inactiveUsersLink).toHaveAttribute('href', '/admin/users');
        expect(activeProjectsLink).toHaveAttribute('href', '/projects');
    });
});
