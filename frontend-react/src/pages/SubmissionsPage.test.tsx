import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import SubmissionsPage from './SubmissionsPage';

const mocks = vi.hoisted(() => ({
    navigate: vi.fn(),
    useAuth: vi.fn(),
    getMySubmissions: vi.fn(),
    deleteSubmission: vi.fn(),
    refreshUser: vi.fn(),
}));

vi.mock('../lib/useAuth', () => ({
    useAuth: mocks.useAuth,
}));

vi.mock('../lib/api', () => ({
    api: {
        getMySubmissions: mocks.getMySubmissions,
        deleteSubmission: mocks.deleteSubmission,
    },
}));

vi.mock('../components/Layout', () => ({
    Navbar: () => <div>Navbar</div>,
    Footer: () => <div>Footer</div>,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mocks.navigate,
    };
});

function renderSubmissionsPage() {
    return render(
        <MemoryRouter>
            <SubmissionsPage />
        </MemoryRouter>,
    );
}

describe('SubmissionsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useAuth.mockReturnValue({
            isAuthenticated: true,
            isLoading: false,
            refreshUser: mocks.refreshUser,
        });
        mocks.getMySubmissions.mockResolvedValue([
            {
                id: 'sub-1',
                user_id: 'user-1',
                user_name: 'Portal User',
                week_id: '2026-W14',
                reported_hours: 5,
                credited_hours: 5,
                total_hours: 5,
                status: 'submitted',
                submitted_at: '2026-04-07T13:00:00Z',
                has_blockers: true,
            },
            {
                id: 'sub-2',
                user_id: 'user-1',
                user_name: 'Portal User',
                week_id: '2026-W13',
                reported_hours: 2.5,
                credited_hours: 2.5,
                total_hours: 2.5,
                status: 'draft',
                submitted_at: null,
                has_blockers: false,
            },
        ]);
        mocks.deleteSubmission.mockResolvedValue(undefined);
        mocks.refreshUser.mockResolvedValue(undefined);
    });

    it('renders submission history, totals, and blocker status', async () => {
        renderSubmissionsPage();

        expect(await screen.findByText('My Submissions')).toBeInTheDocument();
        await waitFor(() => {
            expect(mocks.getMySubmissions).toHaveBeenCalledTimes(1);
        });

        expect(screen.getByText('2026-W14')).toBeInTheDocument();
        expect(screen.getByText('2026-W13')).toBeInTheDocument();
        expect(screen.getByText('Apr 7, 2026')).toBeInTheDocument();
        expect(screen.getByText('5.0h')).toBeInTheDocument();
        expect(screen.getByText('2.5h')).toBeInTheDocument();
        expect(screen.getByText('Yes')).toBeInTheDocument();
        expect(screen.getByText((_, element) => element?.textContent === '7.5h')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /new or missed week/i })).toBeInTheDocument();
    });

    it('shows the empty state when the user has no submissions yet', async () => {
        mocks.getMySubmissions.mockResolvedValue([]);

        renderSubmissionsPage();

        expect(await screen.findByText('No Submissions Yet')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create first submission/i })).toBeInTheDocument();
    });

    it('redirects unauthenticated users back to login', async () => {
        mocks.useAuth.mockReturnValue({
            isAuthenticated: false,
            isLoading: false,
            refreshUser: mocks.refreshUser,
        });

        renderSubmissionsPage();

        await waitFor(() => {
            expect(mocks.navigate).toHaveBeenCalledWith('/login');
        });
        expect(mocks.getMySubmissions).not.toHaveBeenCalled();
    });

    it('refreshes the signed-in user after deleting a submission', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        renderSubmissionsPage();

        expect(await screen.findByText('My Submissions')).toBeInTheDocument();
        const draftRow = screen.getByText('2026-W13').closest('tr');
        expect(draftRow).not.toBeNull();
        const draftRowButtons = draftRow!.querySelectorAll('button');
        expect(draftRowButtons.length).toBeGreaterThan(1);
        fireEvent.click(draftRowButtons[1] as HTMLElement);

        await waitFor(() => {
            expect(mocks.deleteSubmission).toHaveBeenCalledWith('sub-2');
        });
        expect(mocks.refreshUser).toHaveBeenCalledTimes(1);

        confirmSpy.mockRestore();
    });
});
