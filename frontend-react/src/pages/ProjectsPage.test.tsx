import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import ProjectsPage from './ProjectsPage';
import type { Project, User } from '../lib/api';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    getProjects: vi.fn(),
    getAllUsers: vi.fn(),
}));

vi.mock('../lib/useAuth', () => ({
    useAuth: mocks.useAuth,
}));

vi.mock('../lib/api', () => ({
    api: {
        getProjects: mocks.getProjects,
        getAllUsers: mocks.getAllUsers,
    },
}));

vi.mock('../components/Layout', () => ({
    Navbar: () => <div>Navbar</div>,
    Footer: () => <div>Footer</div>,
}));

vi.mock('../components/Logo', () => ({
    Logo: () => <div>Logo</div>,
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

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 'project-1',
        name: 'Website Refresh',
        description: 'Refresh the volunteer portal experience.',
        status: 'active',
        tags: ['volunteer'],
        banner_image: undefined,
        lead: undefined,
        members: [],
        created_at: '2026-03-20T10:00:00Z',
        updated_at: '2026-03-26T12:00:00Z',
        ...overrides,
    };
}

describe('ProjectsPage flash message', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useAuth.mockReturnValue({
            user: makeUser(),
            canManageOperations: false,
        });
        mocks.getProjects.mockResolvedValue([makeProject()]);
        mocks.getAllUsers.mockResolvedValue([]);
    });

    it('shows and dismisses the delete success banner from route state', async () => {
        render(
            <MemoryRouter initialEntries={[{ pathname: '/projects', state: { successMessage: 'Project deleted successfully.' } }]}>
                <ProjectsPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Project deleted successfully.')).toBeInTheDocument();
        expect(mocks.getProjects).toHaveBeenCalledTimes(1);

        await userEvent.click(screen.getByRole('button', { name: /dismiss success message/i }));

        expect(screen.queryByText('Project deleted successfully.')).not.toBeInTheDocument();
    });

    it('includes the project lead alongside members in the directory team avatars', async () => {
        mocks.getProjects.mockResolvedValue([
            makeProject({
                lead: {
                    id: 'lead-1',
                    email: 'lead@example.com',
                    name: 'Lead User',
                    picture: undefined,
                    role: 'volunteer',
                    team: 'Programs',
                    invited_only: false,
                },
                members: [
                    {
                        id: 'member-1',
                        email: 'member@example.com',
                        name: 'Member One',
                        picture: undefined,
                        role: 'volunteer',
                        team: 'Programs',
                        invited_only: false,
                    },
                ],
            }),
        ]);

        render(
            <MemoryRouter initialEntries={['/projects']}>
                <ProjectsPage />
            </MemoryRouter>,
        );

        expect(await screen.findByTitle('Project Lead: Lead User')).toBeInTheDocument();
        expect(screen.getByTitle('Project Member: Member One')).toBeInTheDocument();
    });
});
