import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ProjectDetailPage from './ProjectDetailPage';
import type { Project, ProjectJoinRequest, ProjectUserSummary, ProjectWorkItem, User } from '../lib/api';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    getProject: vi.fn(),
    getProjectWorkItems: vi.fn(),
    getProjectJoinRequests: vi.fn(),
    requestProjectAccess: vi.fn(),
    reviewProjectJoinRequest: vi.fn(),
    createProjectWorkItem: vi.fn(),
    updateProjectWorkItem: vi.fn(),
    updateProject: vi.fn(),
    deleteProjectWorkItem: vi.fn(),
}));

vi.mock('../lib/useAuth', () => ({
    useAuth: mocks.useAuth,
}));

vi.mock('../lib/api', () => ({
    api: {
        getProject: mocks.getProject,
        getProjectWorkItems: mocks.getProjectWorkItems,
        getProjectJoinRequests: mocks.getProjectJoinRequests,
        requestProjectAccess: mocks.requestProjectAccess,
        reviewProjectJoinRequest: mocks.reviewProjectJoinRequest,
        createProjectWorkItem: mocks.createProjectWorkItem,
        updateProjectWorkItem: mocks.updateProjectWorkItem,
        updateProject: mocks.updateProject,
        deleteProjectWorkItem: mocks.deleteProjectWorkItem,
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
        total_hours: 12,
        total_submissions: 3,
        submission_streak: 2,
        created_at: '2026-03-20T10:00:00Z',
        last_login: '2026-03-26T12:00:00Z',
        profile_complete: true,
        admin_access: {
            can_access_portal: false,
            is_delegated: false,
            scopes: [],
        },
        ...overrides,
    };
}

function makeProjectUser(overrides: Partial<ProjectUserSummary> = {}): ProjectUserSummary {
    return {
        id: 'member-1',
        email: 'member@example.com',
        name: 'Member One',
        picture: undefined,
        role: 'volunteer',
        team: 'Programs',
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
        lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'team_lead' }),
        members: [makeProjectUser()],
        created_at: '2026-03-20T10:00:00Z',
        updated_at: '2026-03-26T12:00:00Z',
        ...overrides,
    };
}

function makeWorkItem(overrides: Partial<ProjectWorkItem> = {}): ProjectWorkItem {
    return {
        id: 'work-item-1',
        project_id: 'project-1',
        title: 'Call donors',
        description: 'Reach out to donors',
        item_type: 'task',
        status: 'pending',
        priority: 'medium',
        assignee_id: 'member-1',
        assignee_name: 'Member One',
        assignee_ids: ['member-1'],
        assignee_names: ['Member One'],
        created_by_id: 'lead-1',
        created_by_name: 'Lead User',
        updated_by_id: 'lead-1',
        updated_by_name: 'Lead User',
        due_date: undefined,
        created_at: '2026-03-24T08:00:00Z',
        updated_at: '2026-03-25T09:00:00Z',
        ...overrides,
    };
}

function makeJoinRequest(overrides: Partial<ProjectJoinRequest> = {}): ProjectJoinRequest {
    return {
        id: 'join-1',
        project_id: 'project-1',
        user_id: 'outsider-1',
        user_email: 'outsider@example.com',
        user_name: 'Outside Volunteer',
        message: 'I can help with follow-up.',
        status: 'pending',
        requested_at: '2026-03-25T10:00:00Z',
        reviewed_at: undefined,
        reviewed_by_id: undefined,
        reviewed_by_name: undefined,
        ...overrides,
    };
}

function renderProjectDetail(initialPath = '/projects/project-1') {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route path="/projects" element={<div>Projects Route</div>} />
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('ProjectDetailPage flows', () => {
    beforeEach(() => {
        cleanup();
        localStorage.clear();
        vi.clearAllMocks();
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        mocks.useAuth.mockReturnValue({
            user: makeUser(),
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
        });
        mocks.getProject.mockResolvedValue(makeProject());
        mocks.getProjectWorkItems.mockResolvedValue([]);
        mocks.getProjectJoinRequests.mockResolvedValue([]);
        mocks.requestProjectAccess.mockResolvedValue(makeJoinRequest());
        mocks.reviewProjectJoinRequest.mockResolvedValue(makeJoinRequest({ status: 'approved' }));
        mocks.createProjectWorkItem.mockResolvedValue(makeWorkItem());
        mocks.updateProjectWorkItem.mockResolvedValue(makeWorkItem());
        mocks.updateProject.mockResolvedValue(makeProject());
        mocks.deleteProjectWorkItem.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('lets a view-only user request project access and see the pending state', async () => {
        const outsider = makeUser({
            id: 'outsider-1',
            email: 'outsider@example.com',
            name: 'Outside Volunteer',
        });

        mocks.useAuth.mockReturnValue({
            user: outsider,
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
        });
        mocks.getProject.mockResolvedValue(
            makeProject({
                lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'team_lead' }),
                members: [makeProjectUser({ id: 'member-1', name: 'Member One' })],
            }),
        );
        mocks.getProjectWorkItems.mockResolvedValue([makeWorkItem()]);
        mocks.getProjectJoinRequests
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([makeJoinRequest()]);
        mocks.requestProjectAccess.mockResolvedValue(makeJoinRequest());

        renderProjectDetail();

        expect(await screen.findByText('Join This Project')).toBeInTheDocument();
        expect(screen.getByText('You can view all tasks, but you need access to be assigned work items.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /new work item/i })).not.toBeInTheDocument();

        await userEvent.type(
            screen.getByLabelText(/why do you want to join/i),
            'I can help with volunteer follow-up.',
        );
        await userEvent.click(screen.getByRole('button', { name: /request access/i }));

        await waitFor(() => {
            expect(mocks.requestProjectAccess).toHaveBeenCalledWith('project-1', {
                message: 'I can help with volunteer follow-up.',
            });
        });
        expect(await screen.findByText(/Request pending approval since/i)).toBeInTheDocument();
    });

    it('shows the project lead role with email context in the header', async () => {
        mocks.getProject.mockResolvedValue(
            makeProject({
                lead: makeProjectUser({
                    id: 'lead-1',
                    name: 'Ujwalvanjare7',
                    email: 'ujwalvanjare7@gmail.com',
                    role: 'team_lead',
                    invited_only: true,
                }),
            }),
        );

        renderProjectDetail();

        expect(await screen.findByText('Website Refresh')).toBeInTheDocument();
        expect(screen.getByText('Team Lead:')).toBeInTheDocument();
        expect(screen.getByText('ujwalvanjare7@gmail.com')).toBeInTheDocument();
        expect(screen.getByText('Pending login')).toBeInTheDocument();
    });

    it('lets a board manager approve pending join requests', async () => {
        const leadUser = makeUser({
            id: 'lead-1',
            email: 'lead@example.com',
            name: 'Lead User',
            role: 'team_lead',
        });

        mocks.useAuth.mockReturnValue({
            user: leadUser,
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
        });
        mocks.getProject.mockResolvedValue(
            makeProject({
                lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'team_lead' }),
                members: [makeProjectUser()],
            }),
        );
        mocks.getProjectJoinRequests
            .mockResolvedValueOnce([makeJoinRequest()])
            .mockResolvedValueOnce([]);

        renderProjectDetail();

        expect(await screen.findByText(/Pending Join Requests/i)).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

        await waitFor(() => {
            expect(mocks.reviewProjectJoinRequest).toHaveBeenCalledWith('project-1', 'join-1', 'approved');
        });
        await waitFor(() => {
            expect(screen.queryByText(/Pending Join Requests/i)).not.toBeInTheDocument();
        });
    });

    it('lets an assigned member move their own item and reassign it within the project team', async () => {
        const assignedMember = makeUser({
            id: 'member-1',
            email: 'member@example.com',
            name: 'Member One',
        });
        const updatedWorkItem = makeWorkItem({
            title: 'Call donors tonight',
            status: 'active',
            assignee_id: 'lead-1',
            assignee_name: 'Lead User',
            assignee_ids: ['lead-1'],
            assignee_names: ['Lead User'],
            updated_by_id: 'member-1',
            updated_by_name: 'Member One',
        });

        mocks.useAuth.mockReturnValue({
            user: assignedMember,
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
        });
        mocks.getProject.mockResolvedValue(
            makeProject({
                lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'team_lead' }),
                members: [makeProjectUser({ id: 'member-1', name: 'Member One' })],
            }),
        );
        mocks.getProjectWorkItems
            .mockResolvedValueOnce([makeWorkItem()])
            .mockResolvedValueOnce([updatedWorkItem]);
        mocks.updateProjectWorkItem.mockResolvedValue(updatedWorkItem);

        renderProjectDetail();

        expect(await screen.findByText('Call donors')).toBeInTheDocument();

        await userEvent.click(screen.getByText('Call donors'));

        expect(await screen.findByText('Edit Work Item')).toBeInTheDocument();
        expect(screen.getByLabelText('Assignees')).toBeInTheDocument();

        await userEvent.clear(screen.getByLabelText('Title'));
        await userEvent.type(screen.getByLabelText('Title'), 'Call donors tonight');
        await userEvent.selectOptions(screen.getByLabelText('Status'), 'active');
        await userEvent.click(screen.getByLabelText(/Lead User - lead@example.com/i));
        await userEvent.click(screen.getByLabelText(/Member One - member@example.com/i));
        await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => {
            expect(mocks.updateProjectWorkItem).toHaveBeenCalledWith(
                'project-1',
                'work-item-1',
                {
                    title: 'Call donors tonight',
                    description: 'Reach out to donors',
                    item_type: 'task',
                    status: 'active',
                    priority: 'medium',
                    due_date: null,
                    assignee_ids: ['lead-1'],
                },
            );
        });
        expect(await screen.findByText('Call donors tonight')).toBeInTheDocument();
    });

    it('lets another project member take a work item from the board', async () => {
        const anotherMember = makeUser({
            id: 'member-2',
            email: 'member-two@example.com',
            name: 'Member Two',
        });
        const claimedWorkItem = makeWorkItem({
            assignee_id: 'member-1',
            assignee_name: 'Member One',
            assignee_ids: ['member-1', 'member-2'],
            assignee_names: ['Member One', 'Member Two'],
            updated_by_id: 'member-2',
            updated_by_name: 'Member Two',
        });

        mocks.useAuth.mockReturnValue({
            user: anotherMember,
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
        });
        mocks.getProject.mockResolvedValue(
            makeProject({
                lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'team_lead' }),
                members: [
                    makeProjectUser({ id: 'member-1', name: 'Member One', email: 'member@example.com' }),
                    makeProjectUser({ id: 'member-2', name: 'Member Two', email: 'member-two@example.com' }),
                ],
            }),
        );
        mocks.getProjectWorkItems
            .mockResolvedValueOnce([makeWorkItem()])
            .mockResolvedValueOnce([claimedWorkItem]);
        mocks.updateProjectWorkItem.mockResolvedValue(claimedWorkItem);

        renderProjectDetail();

        expect(await screen.findByText('Call donors')).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /join work/i })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /join work/i }));

        await waitFor(() => {
            expect(mocks.updateProjectWorkItem).toHaveBeenCalledWith(
                'project-1',
                'work-item-1',
                { assignee_ids: ['member-1', 'member-2'] },
            );
        });
        expect(await screen.findByText('Member One & Member Two')).toBeInTheDocument();
    });

    it('lets a manager create and assign a new work item to a team member', async () => {
        const leadUser = makeUser({
            id: 'lead-1',
            email: 'lead@example.com',
            name: 'Lead User',
            role: 'team_lead',
        });
        const member = makeProjectUser({ id: 'member-1', name: 'Member One', email: 'member@example.com' });
        const createdWorkItem = makeWorkItem({
            title: 'Plan community event',
            assignee_id: member.id,
            assignee_name: member.name,
            assignee_ids: [member.id],
            assignee_names: [member.name],
        });

        mocks.useAuth.mockReturnValue({
            user: leadUser,
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
        });
        mocks.getProject.mockResolvedValue(
            makeProject({
                lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'team_lead' }),
                members: [member],
            }),
        );
        mocks.getProjectWorkItems
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([createdWorkItem]);
        mocks.createProjectWorkItem.mockResolvedValue(createdWorkItem);

        renderProjectDetail();

        expect(await screen.findByRole('button', { name: /new work item/i })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /new work item/i }));

        expect(await screen.findByRole('heading', { name: 'New Work Item' })).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText('Title'), 'Plan community event');
        await userEvent.click(screen.getByLabelText(/Member One - member@example.com/i));
        await userEvent.click(screen.getByRole('button', { name: /^create item$/i }));

        await waitFor(() => {
            expect(mocks.createProjectWorkItem).toHaveBeenCalledWith(
                'project-1',
                {
                    title: 'Plan community event',
                    description: null,
                    item_type: 'task',
                    status: 'pending',
                    priority: 'medium',
                    due_date: null,
                    assignee_ids: ['member-1'],
                },
            );
        });
        expect(await screen.findByText('Plan community event')).toBeInTheDocument();
    });

    it('lets a manager assign the same work item to multiple teammates', async () => {
        const leadUser = makeUser({
            id: 'lead-1',
            email: 'lead@example.com',
            name: 'Lead User',
            role: 'team_lead',
        });
        const memberOne = makeProjectUser({ id: 'member-1', name: 'Member One', email: 'member@example.com' });
        const memberTwo = makeProjectUser({ id: 'member-2', name: 'Member Two', email: 'member-two@example.com' });
        const createdWorkItem = makeWorkItem({
            title: 'Launch support rotation',
            assignee_id: memberOne.id,
            assignee_name: memberOne.name,
            assignee_ids: [memberOne.id, memberTwo.id],
            assignee_names: [memberOne.name, memberTwo.name],
        });

        mocks.useAuth.mockReturnValue({
            user: leadUser,
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
        });
        mocks.getProject.mockResolvedValue(
            makeProject({
                lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'team_lead' }),
                members: [memberOne, memberTwo],
            }),
        );
        mocks.getProjectWorkItems
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([createdWorkItem]);
        mocks.createProjectWorkItem.mockResolvedValue(createdWorkItem);

        renderProjectDetail();

        await userEvent.click(await screen.findByRole('button', { name: /new work item/i }));
        await userEvent.type(screen.getByLabelText('Title'), 'Launch support rotation');
        await userEvent.click(screen.getByLabelText(/Member One - member@example.com/i));
        await userEvent.click(screen.getByLabelText(/Member Two - member-two@example.com/i));
        await userEvent.click(screen.getByRole('button', { name: /^create item$/i }));

        await waitFor(() => {
            expect(mocks.createProjectWorkItem).toHaveBeenCalledWith(
                'project-1',
                {
                    title: 'Launch support rotation',
                    description: null,
                    item_type: 'task',
                    status: 'pending',
                    priority: 'medium',
                    due_date: null,
                    assignee_ids: ['member-1', 'member-2'],
                },
            );
        });
        expect(await screen.findByText('Member One & Member Two')).toBeInTheDocument();
    });

    it('lets a manager choose a custom work item type', async () => {
        const leadUser = makeUser({
            id: 'lead-1',
            email: 'lead@example.com',
            name: 'Lead User',
            role: 'team_lead',
        });

        mocks.useAuth.mockReturnValue({
            user: leadUser,
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
        });
        mocks.getProject.mockResolvedValue(
            makeProject({
                lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'team_lead' }),
                members: [makeProjectUser()],
            }),
        );
        mocks.getProjectWorkItems
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([makeWorkItem({ title: 'Draft handoff guide', item_type: 'handoff' })]);
        mocks.createProjectWorkItem.mockResolvedValue(makeWorkItem({ title: 'Draft handoff guide', item_type: 'handoff' }));

        renderProjectDetail();

        await userEvent.click(await screen.findByRole('button', { name: /new work item/i }));
        await userEvent.type(screen.getByLabelText('Title'), 'Draft handoff guide');
        await userEvent.selectOptions(screen.getByLabelText('Type'), 'Custom type');
        await userEvent.type(screen.getByPlaceholderText('Type a custom work item type'), 'handoff');
        await userEvent.click(screen.getByRole('button', { name: /^create item$/i }));

        await waitFor(() => {
            expect(mocks.createProjectWorkItem).toHaveBeenCalledWith(
                'project-1',
                {
                    title: 'Draft handoff guide',
                    description: null,
                    item_type: 'handoff',
                    status: 'pending',
                    priority: 'medium',
                    due_date: null,
                    assignee_ids: [],
                },
            );
        });
    });

    it('lets a project lead edit project tags from the board', async () => {
        const leadUser = makeUser({
            id: 'lead-1',
            email: 'lead@example.com',
            name: 'Lead User',
            role: 'volunteer',
        });
        const updatedProject = makeProject({
            tags: ['volunteer', 'community'],
            lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'volunteer' }),
        });

        mocks.useAuth.mockReturnValue({
            user: leadUser,
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
        });
        mocks.getProject.mockResolvedValue(
            makeProject({
                tags: ['volunteer'],
                lead: makeProjectUser({ id: 'lead-1', name: 'Lead User', email: 'lead@example.com', role: 'volunteer' }),
            }),
        );
        mocks.updateProject.mockResolvedValue(updatedProject);

        renderProjectDetail();

        expect(await screen.findByRole('button', { name: /edit tags/i })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /edit tags/i }));
        await userEvent.type(screen.getByPlaceholderText('Add a custom project tag'), 'community');
        await userEvent.click(screen.getByRole('button', { name: /add tag/i }));
        await userEvent.click(screen.getByRole('button', { name: /save tags/i }));

        await waitFor(() => {
            expect(mocks.updateProject).toHaveBeenCalledWith('project-1', {
                tags: ['volunteer', 'community'],
            });
        });
        expect(await screen.findByText('Community')).toBeInTheDocument();
    });
});
