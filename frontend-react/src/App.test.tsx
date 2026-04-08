import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

const authMock = vi.hoisted(() => ({
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    setName: vi.fn(),
    state: {
        user: null,
        isLoading: false,
        isAuthenticated: false,
        isAdmin: false,
        isTeamLead: false,
        canManageOperations: false,
        canAccessAdminPortal: false,
        isDelegatedAdmin: false,
        adminScopes: [],
        hasAdminScope: vi.fn(() => false),
        needsName: false,
    } as {
        user: Record<string, unknown> | null;
        isLoading: boolean;
        isAuthenticated: boolean;
        isAdmin: boolean;
        isTeamLead: boolean;
        canManageOperations: boolean;
        canAccessAdminPortal: boolean;
        isDelegatedAdmin: boolean;
        adminScopes: string[];
        hasAdminScope: ReturnType<typeof vi.fn>;
        needsName: boolean;
    },
}));

vi.mock('@react-oauth/google', () => ({
    GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./lib/AuthContext', () => ({
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./lib/useAuth', () => ({
    useAuth: () => ({
        ...authMock.state,
        login: authMock.login,
        logout: authMock.logout,
        refreshUser: authMock.refreshUser,
        setName: authMock.setName,
    }),
}));

vi.mock('./pages/LoginPage', () => ({
    default: () => <div>Mock Login Page</div>,
}));

vi.mock('./pages/SetNamePage', () => ({
    default: () => <div>Mock Set Name Page</div>,
}));

vi.mock('./pages/DashboardPage', () => ({
    default: () => <div>Mock Dashboard Page</div>,
}));

vi.mock('./pages/SubmissionsPage', () => ({
    default: () => <div>Mock Submissions Page</div>,
}));

vi.mock('./pages/NewSubmissionPage', () => ({
    default: () => <div>Mock New Submission Page</div>,
}));

vi.mock('./pages/AdminUsersPage', () => ({
    default: () => <div>Mock Admin Users Page</div>,
}));

vi.mock('./pages/AdminSubmissionsPage', () => ({
    default: () => <div>Mock Admin Submissions Page</div>,
}));

vi.mock('./pages/AdminDashboardPage', () => ({
    default: () => <div>Mock Admin Dashboard Page</div>,
}));

vi.mock('./pages/AdminSettingsPage', () => ({
    default: () => <div>Mock Admin Settings Page</div>,
}));

vi.mock('./pages/AdminAuditPage', () => ({
    default: () => <div>Mock Admin Audit Page</div>,
}));

vi.mock('./pages/ProjectsPage', () => ({
    default: () => <div>Mock Projects Page</div>,
}));

vi.mock('./pages/ProjectDetailPage', () => ({
    default: () => <div>Mock Project Detail Page</div>,
}));

describe('App routing', () => {
    beforeEach(() => {
        cleanup();
        localStorage.clear();
        authMock.login.mockReset();
        authMock.logout.mockReset();
        authMock.refreshUser.mockReset();
        authMock.setName.mockReset();
        authMock.state = {
            user: null,
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
            isTeamLead: false,
            canManageOperations: false,
            canAccessAdminPortal: false,
            isDelegatedAdmin: false,
            adminScopes: [],
            hasAdminScope: vi.fn(() => false),
            needsName: false,
        };
        window.history.pushState({}, '', '/login');
    });

    afterEach(() => {
        cleanup();
    });

    it('renders the login route for unauthenticated users', async () => {
        window.history.pushState({}, '', '/login');

        render(<App />);

        expect(await screen.findByText('Mock Login Page')).toBeInTheDocument();
    });

    it('redirects unauthenticated users from protected routes to login', async () => {
        window.history.pushState({}, '', '/dashboard');

        render(<App />);

        expect(await screen.findByText('Mock Login Page')).toBeInTheDocument();
    });

    it('redirects authenticated users without a completed profile to set-name before submissions', async () => {
        authMock.state = {
            user: { id: 'user-1', profile_complete: false },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: false,
            canManageOperations: false,
            canAccessAdminPortal: false,
            isDelegatedAdmin: false,
            adminScopes: [],
            hasAdminScope: vi.fn(() => false),
            needsName: true,
        };
        window.history.pushState({}, '', '/submissions/new');

        render(<App />);

        expect(await screen.findByText('Mock Set Name Page')).toBeInTheDocument();
    });

    it('renders the submission route for authenticated users with a completed profile', async () => {
        authMock.state = {
            user: { id: 'user-1', profile_complete: true },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: false,
            canManageOperations: false,
            canAccessAdminPortal: false,
            isDelegatedAdmin: false,
            adminScopes: [],
            hasAdminScope: vi.fn(() => false),
            needsName: false,
        };
        window.history.pushState({}, '', '/submissions/new');

        render(<App />);

        expect(await screen.findByText('Mock New Submission Page')).toBeInTheDocument();
    });

    it('redirects non-admin users away from admin review routes', async () => {
        authMock.state = {
            user: { id: 'user-1', profile_complete: true },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: false,
            canManageOperations: false,
            canAccessAdminPortal: false,
            isDelegatedAdmin: false,
            adminScopes: [],
            hasAdminScope: vi.fn(() => false),
            needsName: false,
        };
        window.history.pushState({}, '', '/admin/submissions');

        render(<App />);

        expect(await screen.findByText('Mock Dashboard Page')).toBeInTheDocument();
    });

    it('renders the admin review route for admins', async () => {
        authMock.state = {
            user: { id: 'admin-1', profile_complete: true, role: 'admin' },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: true,
            isTeamLead: false,
            canManageOperations: true,
            canAccessAdminPortal: true,
            isDelegatedAdmin: false,
            adminScopes: [],
            hasAdminScope: vi.fn(() => true),
            needsName: false,
        };
        window.history.pushState({}, '', '/admin/submissions');

        render(<App />);

        expect(await screen.findByText('Mock Admin Submissions Page')).toBeInTheDocument();
    });

    it('redirects team leads away from admin review routes without delegated access', async () => {
        authMock.state = {
            user: { id: 'lead-1', profile_complete: true, role: 'team_lead' },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: true,
            canManageOperations: true,
            canAccessAdminPortal: false,
            isDelegatedAdmin: false,
            adminScopes: [],
            hasAdminScope: vi.fn(() => false),
            needsName: false,
        };
        window.history.pushState({}, '', '/admin/submissions');

        render(<App />);

        expect(await screen.findByText('Mock Dashboard Page')).toBeInTheDocument();
    });

    it('renders delegated admin submission access when the proper scope is granted', async () => {
        authMock.state = {
            user: { id: 'delegate-1', profile_complete: true, role: 'team_lead' },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: true,
            canManageOperations: true,
            canAccessAdminPortal: true,
            isDelegatedAdmin: true,
            adminScopes: ['review_submissions'],
            hasAdminScope: vi.fn((scope: string) => scope === 'review_submissions'),
            needsName: false,
        };
        window.history.pushState({}, '', '/admin/submissions');

        render(<App />);

        expect(await screen.findByText('Mock Admin Submissions Page')).toBeInTheDocument();
    });

    it('renders invite-only delegated admin access for the users route', async () => {
        authMock.state = {
            user: { id: 'delegate-2', profile_complete: true, role: 'volunteer' },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: false,
            canManageOperations: false,
            canAccessAdminPortal: true,
            isDelegatedAdmin: true,
            adminScopes: ['manage_invites'],
            hasAdminScope: vi.fn((scope: string) => scope === 'manage_invites'),
            needsName: false,
        };
        window.history.pushState({}, '', '/admin/users');

        render(<App />);

        expect(await screen.findByText('Mock Admin Users Page')).toBeInTheDocument();
    });

    it('renders delegated access oversight for the users route when admin-access viewing is granted', async () => {
        authMock.state = {
            user: { id: 'delegate-2b', profile_complete: true, role: 'volunteer' },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: false,
            canManageOperations: false,
            canAccessAdminPortal: true,
            isDelegatedAdmin: true,
            adminScopes: ['view_admin_access'],
            hasAdminScope: vi.fn((scope: string) => scope === 'view_admin_access'),
            needsName: false,
        };
        window.history.pushState({}, '', '/admin/users');

        render(<App />);

        expect(await screen.findByText('Mock Admin Users Page')).toBeInTheDocument();
    });

    it('redirects delegates away from settings without the settings scope', async () => {
        authMock.state = {
            user: { id: 'delegate-3', profile_complete: true, role: 'team_lead' },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: true,
            canManageOperations: true,
            canAccessAdminPortal: true,
            isDelegatedAdmin: true,
            adminScopes: ['review_submissions'],
            hasAdminScope: vi.fn((scope: string) => scope === 'review_submissions'),
            needsName: false,
        };
        window.history.pushState({}, '', '/admin/settings');

        render(<App />);

        expect(await screen.findByText('Mock Admin Dashboard Page')).toBeInTheDocument();
    });

    it('renders the dedicated audit route when audit access is granted', async () => {
        authMock.state = {
            user: { id: 'delegate-4', profile_complete: true, role: 'volunteer' },
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            isTeamLead: false,
            canManageOperations: false,
            canAccessAdminPortal: true,
            isDelegatedAdmin: true,
            adminScopes: ['view_audit_logs'],
            hasAdminScope: vi.fn((scope: string) => scope === 'view_audit_logs'),
            needsName: false,
        };
        window.history.pushState({}, '', '/admin/audit');

        render(<App />);

        expect(await screen.findByText('Mock Admin Audit Page')).toBeInTheDocument();
    });
});
