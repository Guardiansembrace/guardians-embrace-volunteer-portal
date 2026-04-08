import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';

import AdminUsersPage from './AdminUsersPage';
import type { User } from '../lib/api';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    getAllUsers: vi.fn(),
    getInvites: vi.fn(),
    getAdminAccessGrants: vi.fn(),
}));

vi.mock('../lib/useAuth', () => ({
    useAuth: mocks.useAuth,
}));

vi.mock('../lib/api', () => ({
    api: {
        getAllUsers: mocks.getAllUsers,
        getInvites: mocks.getInvites,
        getAdminAccessGrants: mocks.getAdminAccessGrants,
    },
}));

vi.mock('../components/Layout', () => ({
    Navbar: () => <div>Navbar</div>,
    Footer: () => <div>Footer</div>,
}));

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Portal User',
        picture: undefined,
        role: 'volunteer',
        team: 'Programs',
        is_active: true,
        invited_only: false,
        total_hours: 0,
        total_submissions: 0,
        submission_streak: 0,
        created_at: '2026-03-20T10:00:00Z',
        last_login: '2026-03-26T12:00:00Z',
        profile_complete: true,
        file_access_expires: undefined,
        admin_access: {
            can_access_portal: false,
            is_delegated: false,
            scopes: [],
        },
        ...overrides,
    };
}

describe('AdminUsersPage login state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useAuth.mockReturnValue({
            user: makeUser({ id: 'delegate-1', email: 'delegate@example.com', name: 'Delegate User' }),
            isAdmin: false,
            canAccessAdminPortal: true,
            hasAdminScope: vi.fn((scope: string) => scope === 'view_users'),
            isLoading: false,
            isAuthenticated: true,
        });
        mocks.getInvites.mockResolvedValue([]);
        mocks.getAdminAccessGrants.mockResolvedValue([]);
    });

    it('shows pending login separately from active users', async () => {
        mocks.getAllUsers.mockResolvedValue([
            makeUser({
                id: 'pending-1',
                name: 'Pending Person',
                email: 'pending@example.com',
                invited_only: true,
                last_login: null,
            }),
            makeUser({
                id: 'active-1',
                name: 'Active Person',
                email: 'active@example.com',
                invited_only: false,
                last_login: '2026-04-01T15:00:00Z',
            }),
        ]);

        render(
            <MemoryRouter>
                <AdminUsersPage />
            </MemoryRouter>,
        );

        const pendingRow = (await screen.findByText('Pending Person')).closest('tr');
        const activeRow = (await screen.findByText('Active Person')).closest('tr');

        expect(pendingRow).not.toBeNull();
        expect(activeRow).not.toBeNull();

        expect(within(pendingRow as HTMLElement).getAllByText('Pending login')).toHaveLength(2);
        expect(within(activeRow as HTMLElement).getByText('Active')).toBeInTheDocument();
    });

    it('splits pending first login invite records from access records', async () => {
        mocks.useAuth.mockReturnValue({
            user: makeUser({ id: 'admin-1', email: 'admin@example.com', name: 'Admin User', role: 'admin' }),
            isAdmin: true,
            canAccessAdminPortal: true,
            hasAdminScope: vi.fn(() => true),
            isLoading: false,
            isAuthenticated: true,
        });
        mocks.getAllUsers.mockResolvedValue([]);
        mocks.getInvites.mockResolvedValue([
            {
                id: 'invite-1',
                email: 'pending@example.com',
                role: 'volunteer',
                invited_by: 'admin@example.com',
                created_at: '2026-04-02T10:00:00Z',
                portal_status: 'pending_login',
                has_logged_in: false,
                user_name: 'Pending User',
                user_last_login: null,
            },
            {
                id: 'invite-2',
                email: 'logged@example.com',
                role: 'team_lead',
                invited_by: 'admin@example.com',
                created_at: '2026-04-02T11:00:00Z',
                portal_status: 'access_record',
                has_logged_in: true,
                user_name: 'Logged User',
                user_last_login: '2026-04-03T09:30:00Z',
            },
        ]);

        render(
            <MemoryRouter>
                <AdminUsersPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Pending First Login (1)')).toBeInTheDocument();
        expect(screen.getByText('Access Records (1)')).toBeInTheDocument();
        expect(screen.getByText('Pending first login')).toBeInTheDocument();
        expect(screen.getByText('Logged in')).toBeInTheDocument();
    });
});
