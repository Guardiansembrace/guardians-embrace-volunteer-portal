import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    AlertCircle,
    ArrowLeft,
    Calendar,
    Flag,
    Layers3,
    Mail,
    Plus,
    ShieldCheck,
    Trash2,
    User as UserIcon,
    UserPlus,
    Users,
} from 'lucide-react';

import { Navbar, Footer } from '../components/Layout';
import { Button, EmptyState, GuidancePanel, LoadingSpinner } from '../components/ui';
import { Logo } from '../components/Logo';
import FileUpload from '../components/FileUpload';
import { api } from '../lib/api';
import type { Project, ProjectJoinRequest, ProjectUserSummary, ProjectWorkItem, ProjectWorkItemCreate, User } from '../lib/api';
import {
    buildAssignableUsers,
    buildProjectTeamMembers,
    canAssignProjectWork,
    canContributeToProject,
    canDirectlyDeleteProject,
    canDeleteProjectWorkItem,
    canEditProjectTags,
    canEditProjectWorkItem,
    canManageProjectWork,
    canRequestProjectAccess,
    canRequestProjectDeletion,
    canRequestProjectLeadership,
    formatTagLabel,
    getWorkItemAssigneeIds,
    getWorkItemAssigneeNames,
    getLatestJoinRequest,
    getNonRoleTags,
    getRoleTags,
    normalizeProjectTags,
    type RoleTagValue,
} from '../lib/projectAccess';
import { useAuth } from '../lib/useAuth';

const STATUS_COLUMNS: Array<{
    value: ProjectWorkItem['status'];
    label: string;
    description: string;
    accent: string;
    background: string;
}> = [
    { value: 'pending', label: 'Pending', description: 'Ready to pick up', accent: '#64748b', background: '#f8fafc' },
    { value: 'active', label: 'Active', description: 'Currently in progress', accent: '#d4af37', background: '#fffbeb' },
    { value: 'blocked', label: 'Blocked', description: 'Waiting on something', accent: '#ef4444', background: '#fef2f2' },
    { value: 'finished', label: 'Finished', description: 'Completed', accent: '#10b981', background: '#f0fdf4' },
];

const PRIORITY_OPTIONS: Array<{ value: ProjectWorkItem['priority']; label: string }> = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
];

const TYPE_SUGGESTIONS = ['issue', 'feature', 'task', 'research', 'content', 'design'];
const CUSTOM_TYPE_VALUE = '__custom__';
const ROLE_TAG_OPTIONS: Array<{ value: RoleTagValue; label: string }> = [
    { value: 'volunteer', label: 'Volunteer' },
    { value: 'team_lead', label: 'Team Lead' },
    { value: 'admin', label: 'Admin' },
];

type WorkItemFormState = {
    title: string;
    description: string;
    item_type: string;
    status: ProjectWorkItem['status'];
    priority: ProjectWorkItem['priority'];
    assignee_ids: string[];
    due_date: string;
};

const EMPTY_WORK_ITEM_FORM: WorkItemFormState = {
    title: '',
    description: '',
    item_type: 'task',
    status: 'pending',
    priority: 'medium',
    assignee_ids: [],
    due_date: '',
};

function formatShortDate(value?: string) {
    if (!value) return 'No due date';
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatInputDate(value?: string) {
    return value ? value.slice(0, 10) : '';
}

function getProjectUserDisplayName(user?: Pick<ProjectUserSummary, 'name' | 'email' | 'invited_only'> | null) {
    if (!user) return '';
    if (user.invited_only) return user.email;
    return user.name || user.email;
}

function getProjectUserInitials(user: Pick<ProjectUserSummary, 'name' | 'email' | 'invited_only'>) {
    return getProjectUserDisplayName(user)
        .split(/[\s@._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'U';
}

function getProjectLeadDisplayName(lead: Project['lead']) {
    return getProjectUserDisplayName(lead);
}

function getProjectRequestLabel(requestType: ProjectJoinRequest['request_type']) {
    if (requestType === 'lead') return 'Leadership Request';
    if (requestType === 'delete') return 'Delete Request';
    return 'Access Request';
}

function normalizeAssigneeIds(ids: string[]) {
    return Array.from(new Set(ids.filter(Boolean)));
}

function areAssigneeListsEqual(left: string[], right: string[]) {
    const normalizedLeft = [...normalizeAssigneeIds(left)].sort();
    const normalizedRight = [...normalizeAssigneeIds(right)].sort();
    return normalizedLeft.length === normalizedRight.length
        && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function getAssigneeDisplayLabel(name: string, allNames: string[]) {
    const firstName = name.split(' ')[0];
    const duplicateFirstNameCount = allNames.filter((candidate) => candidate.split(' ')[0] === firstName).length;
    return duplicateFirstNameCount > 1 ? name : firstName;
}

function formatAssigneeSummary(names: string[]) {
    if (names.length === 0) return 'Unassigned';
    if (names.length === 1) return getAssigneeDisplayLabel(names[0], names);
    if (names.length === 2) return `${getAssigneeDisplayLabel(names[0], names)} & ${getAssigneeDisplayLabel(names[1], names)}`;
    return `${getAssigneeDisplayLabel(names[0], names)} +${names.length - 1}`;
}

function isSuggestedType(itemType: string) {
    return TYPE_SUGGESTIONS.includes(itemType);
}

function getPriorityStyles(priority: ProjectWorkItem['priority']) {
    const styles: Record<ProjectWorkItem['priority'], { background: string; color: string; border: string }> = {
        low: { background: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
        medium: { background: '#fffbeb', color: '#b45309', border: '#fde68a' },
        high: { background: '#fef3c7', color: '#92400e', border: '#fcd34d' },
        urgent: { background: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    };

    return styles[priority];
}

function getStatusStyles(status: Project['status']) {
    const styles: Record<Project['status'], { background: string; color: string; border: string }> = {
        active: { background: '#dcfce7', color: '#166534', border: '#bbf7d0' },
        completed: { background: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
        on_hold: { background: '#fef3c7', color: '#92400e', border: '#fde68a' },
        planned: { background: '#f8fafc', color: '#475569', border: '#e2e8f0' },
    };

    return styles[status];
}

export default function ProjectDetailPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [project, setProject] = useState<Project | null>(null);
    const [workItems, setWorkItems] = useState<ProjectWorkItem[]>([]);
    const [joinRequests, setJoinRequests] = useState<ProjectJoinRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [showEditor, setShowEditor] = useState(false);
    const [editingWorkItem, setEditingWorkItem] = useState<ProjectWorkItem | null>(null);
    const [workItemForm, setWorkItemForm] = useState<WorkItemFormState>(EMPTY_WORK_ITEM_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const [showTagEditor, setShowTagEditor] = useState(false);
    const [showDeleteRequestModal, setShowDeleteRequestModal] = useState(false);
    const [tagDraft, setTagDraft] = useState<string[]>([]);
    const [newTagValue, setNewTagValue] = useState('');
    const [isSavingTags, setIsSavingTags] = useState(false);
    const [accessRequestMessage, setAccessRequestMessage] = useState('');
    const [leadRequestMessage, setLeadRequestMessage] = useState('');
    const [deleteRequestMessage, setDeleteRequestMessage] = useState('');
    const [requestingRequestType, setRequestingRequestType] = useState<ProjectJoinRequest['request_type'] | null>(null);
    const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
    const [takingWorkItemId, setTakingWorkItemId] = useState<string | null>(null);
    const [myWorkItemHours, setMyWorkItemHours] = useState<Record<string, number>>({});

    const loadData = useCallback(async () => {
        if (!projectId) {
            setErrorMessage('Project not found.');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setErrorMessage('');

        try {
            const projectPromise = api.getProject(projectId);
            const workItemsPromise = api.getProjectWorkItems(projectId);
            const joinRequestsPromise = api.getProjectJoinRequests(projectId);
            const [projectData, workItemsData, joinRequestsData] = await Promise.all([
                projectPromise,
                workItemsPromise,
                joinRequestsPromise,
            ]);

            setProject(projectData);
            setWorkItems(workItemsData);
            setJoinRequests(joinRequestsData);
        } catch (error) {
            console.error('Failed to load project board', error);
            setErrorMessage(error instanceof Error ? error.message : 'Failed to load project board.');
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!projectId || !user) return;
        let cancelled = false;
        (async () => {
            try {
                const weekInfo = await api.getCurrentWeekInfo(undefined, projectId);
                if (cancelled || !weekInfo.submission_id) return;
                const submission = await api.getSubmission(weekInfo.submission_id);
                if (cancelled) return;
                const hoursMap: Record<string, number> = {};
                for (const entry of [...submission.past_work, ...submission.present_work, ...submission.future_work]) {
                    if (entry.work_item_id) {
                        hoursMap[entry.work_item_id] = (hoursMap[entry.work_item_id] ?? 0) + entry.hours;
                    }
                }
                setMyWorkItemHours(hoursMap);
            } catch {
                // non-critical — silently ignore
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, user]);

    const roleTags = useMemo(() => getRoleTags(project?.tags), [project?.tags]);
    const topicTags = useMemo(() => getNonRoleTags(project?.tags), [project?.tags]);
    const canContribute = Boolean(project && user && canContributeToProject(project, user));
    const canAssignWork = Boolean(project && user && canAssignProjectWork(project, user));
    const canManageWork = Boolean(project && user && canManageProjectWork(project, user));
    const canEditTags = Boolean(project && user && canEditProjectTags(project, user));
    const canRequestAccess = Boolean(project && user && canRequestProjectAccess(project, user));
    const canRequestLead = Boolean(project && user && canRequestProjectLeadership(project, user));
    const canRequestDelete = Boolean(project && user && canRequestProjectDeletion(project, user));
    const canDirectlyDelete = Boolean(user && canDirectlyDeleteProject(user));
    const latestAccessRequest = getLatestJoinRequest(joinRequests, 'access');
    const latestLeadRequest = getLatestJoinRequest(joinRequests, 'lead');
    const latestDeleteRequest = getLatestJoinRequest(joinRequests, 'delete');
    const assignableUsers = project ? buildAssignableUsers(project) : [];
    const projectTeam = project ? buildProjectTeamMembers(project) : [];
    const editableRoleTags = getRoleTags(tagDraft);
    const editableTopicTags = getNonRoleTags(tagDraft);
    const isCustomWorkItemType = !isSuggestedType(workItemForm.item_type);
    const pendingProjectRequests = canManageWork
        ? joinRequests.filter((joinRequest) => joinRequest.status === 'pending')
        : [];

    const groupedWorkItems = STATUS_COLUMNS.map((column) => ({
        ...column,
        items: workItems.filter((workItem) => workItem.status === column.value),
    }));
    const projectBoardGuidelines = [
        canRequestAccess
            ? 'Use Request Access if you want to contribute here. Once approved, you can join or be assigned work items.'
            : canContribute
                ? 'You already have project access, so this board is your main place to pick up work and track progress.'
                : 'View-only users can still learn how the project is organized before deciding whether to get involved.',
        canManageWork
            ? 'Project leads and operations can approve requests, create work items, assign teammates, and keep statuses current.'
            : canContribute
                ? 'Use Take Work or Join Work when you want to add yourself to an open item or collaborate with an existing assignee.'
                : 'Project members use this board to coordinate assignments, due dates, and shared progress.',
        'Mark work as Blocked when it is waiting on a decision, approval, missing access, or missing information.',
    ];

    const openCreateModal = () => {
        if (!user) return;

        const defaultAssigneeIds = canManageWork ? [] : [user.id];
        setEditingWorkItem(null);
        setWorkItemForm({
            ...EMPTY_WORK_ITEM_FORM,
            assignee_ids: defaultAssigneeIds,
        });
        setShowEditor(true);
    };

    const openEditModal = (workItem: ProjectWorkItem) => {
        setEditingWorkItem(workItem);
        setWorkItemForm({
            title: workItem.title,
            description: workItem.description || '',
            item_type: workItem.item_type,
            status: workItem.status,
            priority: workItem.priority,
            assignee_ids: getWorkItemAssigneeIds(workItem),
            due_date: formatInputDate(workItem.due_date),
        });
        setShowEditor(true);
    };

    const closeEditor = () => {
        setShowEditor(false);
        setEditingWorkItem(null);
        setWorkItemForm(EMPTY_WORK_ITEM_FORM);
    };

    const openTagEditor = () => {
        if (!project) return;
        setTagDraft(normalizeProjectTags(project.tags));
        setNewTagValue('');
        setShowTagEditor(true);
    };

    const closeTagEditor = () => {
        setShowTagEditor(false);
        setTagDraft([]);
        setNewTagValue('');
    };

    const openDeleteRequestModal = () => {
        setShowDeleteRequestModal(true);
    };

    const closeDeleteRequestModal = () => {
        setShowDeleteRequestModal(false);
    };

    const toggleRoleTag = (tag: RoleTagValue) => {
        setTagDraft((current) => {
            const next = current.includes(tag)
                ? current.filter((existingTag) => existingTag !== tag)
                : [...current, tag];
            return normalizeProjectTags(next);
        });
    };

    const addCustomTag = () => {
        const trimmedTag = newTagValue.trim();
        if (!trimmedTag) return;

        setTagDraft((current) => normalizeProjectTags([...current, trimmedTag]));
        setNewTagValue('');
    };

    const removeTag = (tag: string) => {
        setTagDraft((current) => current.filter((existingTag) => existingTag.toLowerCase() !== tag.toLowerCase()));
    };

    const handleSaveTags = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!projectId || !project) return;

        setIsSavingTags(true);
        try {
            const updatedProject = await api.updateProject(projectId, {
                tags: normalizeProjectTags(tagDraft),
            });
            setProject(updatedProject);
            closeTagEditor();
        } catch (error) {
            console.error('Failed to update project tags', error);
            window.alert(error instanceof Error ? error.message : 'Failed to update project tags.');
        } finally {
            setIsSavingTags(false);
        }
    };

    const handleCreateProjectRequest = async (
        event: React.FormEvent,
        requestType: ProjectJoinRequest['request_type']
    ) => {
        event.preventDefault();
        if (!projectId) return;

        const message = requestType === 'lead'
            ? leadRequestMessage
            : requestType === 'delete'
                ? deleteRequestMessage
                : accessRequestMessage;

        setRequestingRequestType(requestType);
        try {
            await api.requestProjectAccess(projectId, {
                request_type: requestType,
                message: message.trim() || null,
            });
            if (requestType === 'lead') {
                setLeadRequestMessage('');
            } else if (requestType === 'delete') {
                setDeleteRequestMessage('');
                closeDeleteRequestModal();
            } else {
                setAccessRequestMessage('');
            }
            await loadData();
        } catch (error) {
            console.error('Failed to submit project request', error);
            window.alert(error instanceof Error ? error.message : 'Failed to submit project request.');
        } finally {
            setRequestingRequestType(null);
        }
    };

    const handleReviewJoinRequest = async (
        joinRequestId: string,
        nextStatus: 'approved' | 'declined'
    ) => {
        if (!projectId) return;

        setReviewingRequestId(joinRequestId);
        try {
            const reviewedRequest = await api.reviewProjectJoinRequest(projectId, joinRequestId, nextStatus);
            if (reviewedRequest.request_type === 'delete' && reviewedRequest.status === 'approved') {
                navigate('/projects', {
                    replace: true,
                    state: { successMessage: 'Project deleted successfully.' },
                });
                return;
            }
            await loadData();
        } catch (error) {
            console.error('Failed to review join request', error);
            window.alert(error instanceof Error ? error.message : 'Failed to review join request.');
        } finally {
            setReviewingRequestId(null);
        }
    };

    const handleSaveWorkItem = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!projectId) return;

        setIsSaving(true);
        try {
            const payload: ProjectWorkItemCreate = {
                title: workItemForm.title.trim(),
                description: workItemForm.description.trim() || null,
                item_type: workItemForm.item_type.trim(),
                status: workItemForm.status,
                priority: workItemForm.priority,
                due_date: workItemForm.due_date || null,
            };
            const nextAssigneeIds = normalizeAssigneeIds(workItemForm.assignee_ids);
            const currentAssigneeIds = editingWorkItem ? getWorkItemAssigneeIds(editingWorkItem) : [];
            const assigneeChanged = !areAssigneeListsEqual(nextAssigneeIds, currentAssigneeIds);

            if (canAssignWork && (!editingWorkItem || assigneeChanged)) {
                payload.assignee_ids = nextAssigneeIds;
            }

            if (editingWorkItem) {
                await api.updateProjectWorkItem(projectId, editingWorkItem.id, payload);
            } else {
                await api.createProjectWorkItem(projectId, payload);
            }

            closeEditor();
            await loadData();
        } catch (error) {
            console.error('Failed to save work item', error);
            window.alert(error instanceof Error ? error.message : 'Failed to save work item.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteWorkItem = async (workItem: ProjectWorkItem) => {
        if (!projectId) return;
        if (!window.confirm(`Delete "${workItem.title}"? This cannot be undone.`)) return;

        try {
            await api.deleteProjectWorkItem(projectId, workItem.id);
            await loadData();
        } catch (error) {
            console.error('Failed to delete work item', error);
            window.alert(error instanceof Error ? error.message : 'Failed to delete work item.');
        }
    };

    const handleTakeWorkItem = async (workItem: ProjectWorkItem) => {
        if (!projectId || !user) return;
        const currentAssigneeIds = getWorkItemAssigneeIds(workItem);
        const currentAssigneeNames = getWorkItemAssigneeNames(workItem);
        if (currentAssigneeIds.includes(user.id)) return;

        if (
            currentAssigneeNames.length > 0
            && !window.confirm(`"${workItem.title}" is currently assigned to ${currentAssigneeNames.join(', ')}. Add yourself too?`)
        ) {
            return;
        }

        setTakingWorkItemId(workItem.id);
        try {
            await api.updateProjectWorkItem(projectId, workItem.id, { assignee_ids: [...currentAssigneeIds, user.id] });
            await loadData();
        } catch (error) {
            console.error('Failed to take work item', error);
            window.alert(error instanceof Error ? error.message : 'Failed to take work item.');
        } finally {
            setTakingWorkItemId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="page-wrapper" style={{ background: 'var(--color-bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <Navbar />
                <main id="main-content" className="main-content" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LoadingSpinner size={44} />
                </main>
                <Footer />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="page-wrapper" style={{ background: 'var(--color-bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <Navbar />
                <main id="main-content" className="main-content" style={{ flex: 1 }}>
                    <div className="container" style={{ padding: '3rem 1rem' }}>
                        <EmptyState
                            icon={<AlertCircle size={42} />}
                            title="Project Not Found"
                            description={errorMessage || 'We could not load this project. It may have been deleted or you may not have access.'}
                            action={
                                <Button type="button" onClick={() => navigate('/projects')}>
                                    Return to Directory
                                </Button>
                            }
                        />
                    </div>
                </main>
                <Footer />
            </div>
        );
    }

    const projectStatus = getStatusStyles(project.status);

    return (
        <div className="page-wrapper" style={{ background: 'var(--color-bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <main id="main-content" className="main-content" style={{ flex: 1 }}>
                
                {/* Project Header Banner - Redesigned to float beautifully */}
                <div style={{ background: 'linear-gradient(to bottom, #f8fafc, white)', borderBottom: '1px solid #e2e8f0', paddingBottom: '2rem' }}>
                    <div className="container" style={{ padding: '2rem 1rem 0', maxWidth: '1400px', margin: '0 auto' }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <Link
                                to="/projects"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    color: '#64748b',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.85rem'
                                }}
                                className="hover:text-slate-900 transition-colors"
                            >
                                <ArrowLeft size={16} />
                                Back to Directory
                            </Link>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2rem' }}>
                            <div style={{ display: 'flex', gap: '1.5rem', flex: '1 1 min-content' }}>
                                <div
                                    style={{
                                        width: '5rem',
                                        height: '5rem',
                                        background: project.banner_image ? `url(${project.banner_image}) center / cover` : 'white',
                                        borderRadius: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.04), 0 0 0 1px #e2e8f0',
                                        flexShrink: 0
                                    }}
                                >
                                    {!project.banner_image && <Logo size={42} style={{ opacity: 0.9 }} />}
                                </div>
                                
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                        <div
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                borderRadius: '999px',
                                                padding: '0.2rem 0.6rem',
                                                background: projectStatus.background,
                                                color: projectStatus.color,
                                                border: `1px solid ${projectStatus.border}`,
                                                fontSize: '0.75rem',
                                                fontWeight: 800,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em'
                                            }}
                                        >
                                            {formatTagLabel(project.status)}
                                        </div>
                                        
                                        {(roleTags.length > 0 || topicTags.length > 0) && (
                                            <div style={{ display: 'flex', gap: '0.4rem flex-wrap' }}>
                                                {roleTags.slice(0, 2).map((tag) => (
                                                    <span key={tag} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9f1239', background: '#ffe4e6', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>{formatTagLabel(tag)}</span>
                                                ))}
                                                {topicTags.slice(0, 2).map((tag) => (
                                                    <span key={tag} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>{formatTagLabel(tag)}</span>
                                                ))}
                                                {(roleTags.length + topicTags.length) > 4 && (
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', padding: '0.2rem' }}>+{roleTags.length + topicTags.length - 4} more</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                                        {project.name}
                                    </h1>
                                    <p style={{ margin: 0, fontSize: '1.05rem', color: '#64748b', maxWidth: '800px', lineHeight: 1.5 }}>
                                        {project.description}
                                    </p>
                                    
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginTop: '1rem', fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} title="Visibility">
                                            <ShieldCheck size={16} style={{ color: '#94a3b8' }} />
                                            <span>Visible to all</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} title="Project Lead">
                                            <UserIcon size={16} style={{ color: '#94a3b8' }} />
                                            <span>
                                                {project.lead ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                        <span style={{ color: '#0f172a', fontWeight: 700 }}>
                                                            Project Lead:
                                                        </span>
                                                        <span style={{ color: '#0f172a', fontWeight: 600 }}>
                                                            {getProjectLeadDisplayName(project.lead)}
                                                        </span>
                                                        {!project.lead.invited_only && (
                                                            <span style={{ color: '#64748b' }}>{project.lead.email}</span>
                                                        )}
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.15rem 0.55rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.72rem', fontWeight: 700 }}>
                                                            {formatTagLabel(project.lead.role)} account
                                                        </span>
                                                        {project.lead.invited_only && (
                                                            <span style={{ color: '#b45309', fontWeight: 600 }}>Pending login</span>
                                                        )}
                                                    </span>
                                                ) : 'No lead assigned'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} title="Your Access Level">
                                            <Layers3 size={16} style={{ color: '#94a3b8' }} />
                                            <span style={{ color: canManageWork ? 'var(--color-primary-gold)' : canContribute ? '#0f172a' : 'inherit', fontWeight: (canManageWork || canContribute) ? 700 : 500 }}>
                                                {canManageWork ? 'Manager Access' : canContribute ? 'Contributor Access' : 'View-Only Access'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.6rem' }}>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {canRequestDelete && latestDeleteRequest?.status !== 'pending' && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={openDeleteRequestModal}
                                            style={{ borderColor: '#fecaca', color: '#dc2626' }}
                                        >
                                            <Trash2 size={16} style={{ marginRight: '0.4rem' }} />
                                            Request Deletion
                                        </Button>
                                    )}
                                    {canEditTags && (
                                        <Button type="button" variant="secondary" onClick={openTagEditor}>
                                            <Flag size={16} style={{ marginRight: '0.4rem' }} />
                                            Edit Tags
                                        </Button>
                                    )}
                                    {canContribute ? (
                                        <Button type="button" onClick={openCreateModal} style={{ boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)' }}>
                                            <Plus size={18} style={{ marginRight: '0.5rem' }} />
                                            New Work Item
                                        </Button>
                                    ) : (
                                        <div style={{ borderRadius: '999px', padding: '0.4rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '0.85rem' }}>
                                            Read Only
                                        </div>
                                    )}
                                </div>

                                {canRequestDelete && latestDeleteRequest?.status === 'pending' && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '999px', padding: '0.45rem 0.9rem', background: '#fff5f5', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600, fontSize: '0.82rem' }}>
                                        <LoadingSpinner size={14} />
                                        Deletion request pending since {formatShortDate(latestDeleteRequest.requested_at)}
                                    </div>
                                )}

                                {canRequestDelete && latestDeleteRequest?.status === 'declined' && (
                                    <div style={{ color: '#b45309', fontSize: '0.82rem', fontWeight: 600 }}>
                                        Your previous deletion request was declined. You can send another.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="container" style={{ padding: '2rem 1rem 4rem', maxWidth: '1400px', margin: '0 auto' }}>
                    {errorMessage && (
                        <div style={{ marginBottom: '2rem', padding: '1rem', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600 }}>
                            <AlertCircle size={20} />
                            {errorMessage}
                        </div>
                    )}

                    <GuidancePanel
                        title="How This Project Board Works"
                        description="These short rules help volunteers understand what they can do from the board based on their current access."
                        items={projectBoardGuidelines}
                        icon={<Layers3 size={18} />}
                        tone="slate"
                        style={{ marginBottom: '2rem' }}
                    />

                    <div style={{ marginBottom: '2rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 4px 15px rgba(15, 23, 42, 0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <div>
                                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Project Team</h3>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.92rem' }}>
                                    Everyone currently attached to this board, including the assigned lead.
                                </p>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.4rem 0.9rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '0.82rem' }}>
                                {projectTeam.length} {projectTeam.length === 1 ? 'person' : 'people'}
                            </div>
                        </div>

                        {projectTeam.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                                {projectTeam.map((member) => {
                                    const isLead = project.lead?.id === member.id;
                                    const displayName = getProjectUserDisplayName(member);
                                    const initials = getProjectUserInitials(member);

                                    return (
                                        <div
                                            key={member.id}
                                            style={{
                                                background: isLead ? '#fffbeb' : '#f8fafc',
                                                borderRadius: '14px',
                                                border: `1px solid ${isLead ? '#fde68a' : '#e2e8f0'}`,
                                                padding: '1rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                                {member.picture ? (
                                                    <img
                                                        src={member.picture}
                                                        alt=""
                                                        style={{ width: '2.75rem', height: '2.75rem', borderRadius: '999px', objectFit: 'cover', flexShrink: 0, background: '#e2e8f0' }}
                                                    />
                                                ) : (
                                                    <div style={{ width: '2.75rem', height: '2.75rem', borderRadius: '999px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#475569', flexShrink: 0 }}>
                                                        {initials}
                                                    </div>
                                                )}

                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.45rem' }}>
                                                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{displayName}</h4>
                                                        {isLead && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.15rem 0.55rem', background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.72rem', fontWeight: 700 }}>
                                                                Project Lead
                                                            </span>
                                                        )}
                                                        {member.invited_only && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.15rem 0.55rem', background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', fontSize: '0.72rem', fontWeight: 700 }}>
                                                                Pending login
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', color: '#64748b' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                            <UserIcon size={14} style={{ color: '#94a3b8' }} />
                                                            <span>{formatTagLabel(member.role)} account</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                                                            <Mail size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                                            <a href={`mailto:${member.email}`} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflowWrap: 'anywhere' }}>
                                                                {member.email}
                                                            </a>
                                                        </div>
                                                        {member.team && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                <Users size={14} style={{ color: '#94a3b8' }} />
                                                                <span>{member.team}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.92rem' }}>
                                No lead or members are assigned to this project yet.
                            </p>
                        )}
                    </div>

                    {canContribute && (
                        <div style={{ marginBottom: '2rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 4px 15px rgba(15, 23, 42, 0.04)' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Project Files</h3>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.92rem' }}>
                                    Upload shared files for this project. Everyone on the project can see them here.
                                </p>
                            </div>
                            <FileUpload
                                projectId={project.id}
                                sourceType="project"
                                canDelete={canManageWork}
                                leadEmail={project.lead?.email}
                            />
                        </div>
                    )}

                    {/* Join / Access Management Sections */}
                    {(canRequestAccess || canRequestLead || (canManageWork && pendingProjectRequests.length > 0)) && (
                        <div style={{ marginBottom: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {canRequestAccess && (
                                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #fde68a', padding: '1.5rem', boxShadow: '0 4px 15px rgba(212, 175, 55, 0.05)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: 'var(--color-primary-gold)' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', color: '#0f172a' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: '#fffbeb', color: '#b45309' }}>
                                            <UserPlus size={18} />
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Join This Project</h3>
                                    </div>
                                    <p style={{ margin: '0 0 1rem 0', color: '#64748b', fontSize: '0.95rem' }}>
                                        You can view all tasks, but you need access to be assigned work items.
                                    </p>
                                    
                                    {latestAccessRequest?.status === 'pending' ? (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px', padding: '0.5rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>
                                            <LoadingSpinner size={14} />
                                            Request pending approval since {formatShortDate(latestAccessRequest.requested_at)}
                                        </div>
                                    ) : (
                                        <form onSubmit={(event) => handleCreateProjectRequest(event, 'access')} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ marginBottom: '1rem' }}>
                                                <label htmlFor="project-join-request-message" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Why do you want to join? (Optional)</label>
                                                <textarea
                                                    id="project-join-request-message"
                                                    className="form-textarea"
                                                    rows={2}
                                                    value={accessRequestMessage}
                                                    onChange={(event) => setAccessRequestMessage(event.target.value)}
                                                    placeholder="Let the project lead know how you can help..."
                                                    style={{ background: 'white', borderColor: '#cbd5e1' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                                    {latestAccessRequest?.status === 'declined' ? 'Your previous request was declined. You may try again.' : 'Project leads can approve your request.'}
                                                </span>
                                                <Button type="submit" isLoading={requestingRequestType === 'access'} size="sm">
                                                    Request Access
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            )}

                            {canRequestLead && (
                                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #c7d2fe', padding: '1.5rem', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.08)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: '#6366f1' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', color: '#0f172a' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: '#eef2ff', color: '#4338ca' }}>
                                            <ShieldCheck size={18} />
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Request to Lead This Project</h3>
                                    </div>
                                    <p style={{ margin: '0 0 1rem 0', color: '#64748b', fontSize: '0.95rem' }}>
                                        Want to coordinate this project? Send a short note and an existing lead or operations user can review it.
                                    </p>

                                    {latestLeadRequest?.status === 'pending' ? (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px', padding: '0.5rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>
                                            <LoadingSpinner size={14} />
                                            Leadership request pending since {formatShortDate(latestLeadRequest.requested_at)}
                                        </div>
                                    ) : (
                                        <form onSubmit={(event) => handleCreateProjectRequest(event, 'lead')} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ marginBottom: '1rem' }}>
                                                <label htmlFor="project-lead-request-message" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Why do you want to lead? (Optional)</label>
                                                <textarea
                                                    id="project-lead-request-message"
                                                    className="form-textarea"
                                                    rows={2}
                                                    value={leadRequestMessage}
                                                    onChange={(event) => setLeadRequestMessage(event.target.value)}
                                                    placeholder="Share how you would coordinate the project..."
                                                    style={{ background: 'white', borderColor: '#cbd5e1' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                                    {latestLeadRequest?.status === 'declined' ? 'Your previous leadership request was declined. You may try again.' : 'Leadership requests can be approved by the current lead or operations team.'}
                                                </span>
                                                <Button type="submit" isLoading={requestingRequestType === 'lead'} size="sm" variant="secondary">
                                                    Request Lead Role
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            )}

                            {canManageWork && pendingProjectRequests.length > 0 && (
                                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e0e7ff', padding: '1.5rem', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.05)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: '#3b82f6' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: '#0f172a' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', color: '#1d4ed8' }}>
                                            <UserPlus size={18} />
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Pending Project Requests ({pendingProjectRequests.length})</h3>
                                    </div>
                                    
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                        {pendingProjectRequests.map((joinRequest) => (
                                            <div key={joinRequest.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{joinRequest.user_name}</div>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.2rem 0.6rem', background: joinRequest.request_type === 'lead' ? '#eef2ff' : joinRequest.request_type === 'delete' ? '#fef2f2' : '#fffbeb', color: joinRequest.request_type === 'lead' ? '#4338ca' : joinRequest.request_type === 'delete' ? '#dc2626' : '#b45309', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                                                            {getProjectRequestLabel(joinRequest.request_type)}
                                                        </span>
                                                    </div>
                                                    <div style={{ color: '#64748b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        {joinRequest.user_email} <span>•</span> Requested {formatShortDate(joinRequest.requested_at)}
                                                    </div>
                                                    {joinRequest.message && (
                                                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'white', borderRadius: '6px', border: '1px dashed #cbd5e1', color: '#475569', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                                            "{joinRequest.message}"
                                                        </div>
                                                    )}
                                                    {joinRequest.request_type === 'delete' && !canDirectlyDelete && (
                                                        <div style={{ marginTop: '0.5rem', color: '#b45309', fontSize: '0.85rem', fontWeight: 600 }}>
                                                            Delete requests need an operations reviewer.
                                                        </div>
                                                    )}
                                                </div>
                                                {joinRequest.request_type !== 'delete' || canDirectlyDelete ? (
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <Button type="button" size="sm" variant="outline" onClick={() => handleReviewJoinRequest(joinRequest.id, 'declined')} disabled={reviewingRequestId === joinRequest.id} style={{ borderColor: '#fecaca', color: '#ef4444' }} className="hover:bg-red-50">
                                                            Decline
                                                        </Button>
                                                        <Button type="button" size="sm" onClick={() => handleReviewJoinRequest(joinRequest.id, 'approved')} disabled={reviewingRequestId === joinRequest.id} style={{ background: '#3b82f6' }}>
                                                            Approve
                                                        </Button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Kanban Board */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
                        {groupedWorkItems.map((column) => (
                            <div key={column.value} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: `2px solid ${column.accent}40` }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: column.accent }} />
                                            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{column.label}</h2>
                                        </div>
                                        <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>{column.description}</p>
                                    </div>
                                    <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.1rem 0.6rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700 }}>
                                        {column.items.length}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '10rem' }}>
                                    {column.items.length > 0 ? (
                                        column.items.map((workItem) => (
                                            <WorkItemCard
                                                key={workItem.id}
                                                workItem={workItem}
                                                project={project}
                                                currentUser={user}
                                                onEdit={() => openEditModal(workItem)}
                                                onTakeWork={() => handleTakeWorkItem(workItem)}
                                                onDelete={() => handleDeleteWorkItem(workItem)}
                                                isTakingWork={takingWorkItemId === workItem.id}
                                                loggedHours={myWorkItemHours[workItem.id]}
                                            />
                                        ))
                                    ) : (
                                        <div style={{ border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', background: 'rgba(255,255,255,0.4)' }}>
                                            Empty
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
            <Footer />

            {/* Editor Modal */}
            {showEditor && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000, animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '2rem', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                                    {editingWorkItem ? 'Edit Work Item' : 'New Work Item'}
                                </h2>
                            </div>
                            <button type="button" onClick={closeEditor} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex' }} className="hover:bg-slate-100 hover:text-slate-700">
                                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveWorkItem}>
                            <div style={{ display: 'grid', gap: '1.25rem' }}>
                                <div>
                                    <label htmlFor="project-work-item-title" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Title</label>
                                    <input
                                        id="project-work-item-title"
                                        type="text"
                                        className="form-input"
                                        style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}
                                        value={workItemForm.title}
                                        onChange={(event) => setWorkItemForm((current) => ({ ...current, title: event.target.value }))}
                                        required
                                        placeholder="E.g. Fix login bug, Write user guide..."
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label htmlFor="project-work-item-type" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Type</label>
                                        <select
                                            id="project-work-item-type"
                                            className="form-input"
                                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}
                                            value={isCustomWorkItemType ? CUSTOM_TYPE_VALUE : workItemForm.item_type}
                                            onChange={(event) => {
                                                const selectedType = event.target.value;
                                                setWorkItemForm((current) => ({
                                                    ...current,
                                                    item_type: selectedType === CUSTOM_TYPE_VALUE
                                                        ? (isSuggestedType(current.item_type) ? '' : current.item_type)
                                                        : selectedType,
                                                }));
                                            }}
                                        >
                                            {TYPE_SUGGESTIONS.map((suggestion) => (
                                                <option key={suggestion} value={suggestion}>
                                                    {formatTagLabel(suggestion)}
                                                </option>
                                            ))}
                                            <option value={CUSTOM_TYPE_VALUE}>Custom type</option>
                                        </select>
                                        {isCustomWorkItemType && (
                                            <input
                                                id="project-work-item-custom-type"
                                                type="text"
                                                className="form-input"
                                                style={{ background: '#f8fafc', border: '1px solid #cbd5e1', marginTop: '0.65rem' }}
                                                value={workItemForm.item_type}
                                                onChange={(event) => setWorkItemForm((current) => ({ ...current, item_type: event.target.value }))}
                                                required
                                                placeholder="Type a custom work item type"
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label htmlFor="project-work-item-status" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Status</label>
                                        <select
                                            id="project-work-item-status"
                                            className="form-input"
                                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}
                                            value={workItemForm.status}
                                            onChange={(event) => setWorkItemForm((current) => ({ ...current, status: event.target.value as ProjectWorkItem['status'] }))}
                                        >
                                            {STATUS_COLUMNS.map((col) => <option key={col.value} value={col.value}>{col.label}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label htmlFor="project-work-item-priority" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Priority</label>
                                        <select
                                            id="project-work-item-priority"
                                            className="form-input"
                                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}
                                            value={workItemForm.priority}
                                            onChange={(event) => setWorkItemForm((current) => ({ ...current, priority: event.target.value as ProjectWorkItem['priority'] }))}
                                        >
                                            {PRIORITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="project-work-item-due-date" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Due Date</label>
                                        <input
                                            id="project-work-item-due-date"
                                            className="form-input"
                                            type="date"
                                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}
                                            value={workItemForm.due_date}
                                            onChange={(event) => setWorkItemForm((current) => ({ ...current, due_date: event.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="project-work-item-assignee" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Assignees</label>
                                    {canAssignWork ? (
                                        <div>
                                            <div
                                                id="project-work-item-assignee"
                                                role="group"
                                                aria-label="Assignees"
                                                style={{
                                                    display: 'grid',
                                                    gap: '0.6rem',
                                                    maxHeight: '220px',
                                                    overflowY: 'auto',
                                                    padding: '0.85rem',
                                                    background: '#f8fafc',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '10px',
                                                }}
                                            >
                                                {assignableUsers.map((candidate) => {
                                                    const isChecked = workItemForm.assignee_ids.includes(candidate.id);
                                                    return (
                                                        <label
                                                            key={candidate.id}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'flex-start',
                                                                gap: '0.75rem',
                                                                padding: '0.65rem 0.75rem',
                                                                background: isChecked ? '#fff8dc' : '#ffffff',
                                                                border: `1px solid ${isChecked ? '#d4af37' : '#e2e8f0'}`,
                                                                borderRadius: '10px',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => {
                                                                    setWorkItemForm((current) => {
                                                                        const nextAssigneeIds = isChecked
                                                                            ? current.assignee_ids.filter((assigneeId) => assigneeId !== candidate.id)
                                                                            : [...current.assignee_ids, candidate.id];
                                                                        return {
                                                                            ...current,
                                                                            assignee_ids: normalizeAssigneeIds(nextAssigneeIds),
                                                                        };
                                                                    });
                                                                }}
                                                            />
                                                            <span style={{ display: 'grid', gap: '0.2rem', color: '#334155' }}>
                                                                <span style={{ fontWeight: 700 }}>
                                                                    {candidate.name} - {candidate.email}
                                                                </span>
                                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                                    {formatTagLabel(candidate.role)}{candidate.invited_only ? ' - Pending login' : ''}
                                                                </span>
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.6rem', alignItems: 'center' }}>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                                    Choose one or more teammates already added to this project.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setWorkItemForm((current) => ({ ...current, assignee_ids: [] }))}
                                                    style={{ border: 'none', background: 'none', color: '#8b1538', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
                                                >
                                                    Clear all
                                                </button>
                                            </div>
                                            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                                Invited teammates are marked until they complete their first login.
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#64748b', fontSize: '0.9rem' }}>
                                            Bound to your user account.
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="project-work-item-description" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Description</label>
                                    <textarea
                                        id="project-work-item-description"
                                        className="form-textarea"
                                        rows={4}
                                        style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}
                                        value={workItemForm.description}
                                        onChange={(event) => setWorkItemForm((current) => ({ ...current, description: event.target.value }))}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
                                    <Button type="button" variant="ghost" onClick={closeEditor}>Cancel</Button>
                                    <Button type="submit" isLoading={isSaving} style={{ boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)' }}>
                                        {editingWorkItem ? 'Save Changes' : 'Create Item'}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showDeleteRequestModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
                    <div style={{ width: '100%', maxWidth: '560px', background: '#ffffff', borderRadius: '20px', padding: '2rem', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>Request Project Deletion</h2>
                                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.95rem' }}>
                                    Ask an operations reviewer to archive and remove this project.
                                </p>
                            </div>
                            <button type="button" onClick={closeDeleteRequestModal} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%' }} className="hover:bg-slate-100 hover:text-slate-700">
                                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
                            </button>
                        </div>

                        <form onSubmit={(event) => handleCreateProjectRequest(event, 'delete')} style={{ display: 'grid', gap: '1.25rem' }}>
                            <div>
                                <label htmlFor="project-delete-request-message" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Why should this project be deleted? (Optional)</label>
                                <textarea
                                    id="project-delete-request-message"
                                    className="form-textarea"
                                    rows={4}
                                    value={deleteRequestMessage}
                                    onChange={(event) => setDeleteRequestMessage(event.target.value)}
                                    placeholder="Explain why the project should be removed..."
                                    style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}
                                />
                            </div>

                            <div style={{ borderRadius: '14px', padding: '0.9rem 1rem', background: '#fff5f5', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                Only operations reviewers can approve project deletion requests.
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                    {latestDeleteRequest?.status === 'declined'
                                        ? 'Your previous deletion request was declined. You may try again.'
                                        : 'Use this when the project is finished or no longer needed.'}
                                </span>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <Button type="button" variant="ghost" onClick={closeDeleteRequestModal}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" isLoading={requestingRequestType === 'delete'} variant="outline" style={{ borderColor: '#fecaca', color: '#dc2626' }}>
                                        <Trash2 size={16} style={{ marginRight: '0.4rem' }} />
                                        Send Deletion Request
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showTagEditor && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
                    <div style={{ width: '100%', maxWidth: '640px', background: '#ffffff', borderRadius: '20px', padding: '2rem', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>Edit Project Tags</h2>
                                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.95rem' }}>
                                    Project leads and admins can manage the visible role labels and custom project tags here.
                                </p>
                            </div>
                            <button type="button" onClick={closeTagEditor} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%' }} className="hover:bg-slate-100 hover:text-slate-700">
                                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTags} style={{ display: 'grid', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>Role Tags</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    {ROLE_TAG_OPTIONS.map((option) => {
                                        const isSelected = editableRoleTags.includes(option.value);
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => toggleRoleTag(option.value)}
                                                style={{
                                                    border: isSelected ? '1px solid #8b1538' : '1px solid #d1d5db',
                                                    backgroundColor: isSelected ? '#fff1f2' : '#ffffff',
                                                    color: isSelected ? '#8b1538' : '#374151',
                                                    borderRadius: '999px',
                                                    padding: '0.5rem 0.85rem',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>Custom Tags</label>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                    {editableTopicTags.length > 0 ? editableTopicTags.map((tag) => (
                                        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '999px', padding: '0.45rem 0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', fontSize: '0.85rem', fontWeight: 600 }}>
                                            {formatTagLabel(tag)}
                                            <button type="button" onClick={() => removeTag(tag)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.75rem', fontWeight: 700 }}>
                                                Remove
                                            </button>
                                        </span>
                                    )) : (
                                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No custom tags yet.</span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <input
                                        className="form-input"
                                        style={{ flex: '1 1 240px', background: '#f8fafc', border: '1px solid #cbd5e1' }}
                                        value={newTagValue}
                                        onChange={(event) => setNewTagValue(event.target.value)}
                                        placeholder="Add a custom project tag"
                                    />
                                    <Button type="button" variant="secondary" onClick={addCustomTag}>
                                        Add Tag
                                    </Button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                                <Button type="button" variant="ghost" onClick={closeTagEditor}>
                                    Cancel
                                </Button>
                                <Button type="submit" isLoading={isSavingTags}>
                                    Save Tags
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function WorkItemCard({
    workItem,
    project,
    currentUser,
    onEdit,
    onTakeWork,
    onDelete,
    isTakingWork,
    loggedHours,
}: {
    workItem: ProjectWorkItem;
    project: Project;
    currentUser: User | null;
    onEdit: () => void;
    onTakeWork: () => void;
    onDelete: () => void;
    isTakingWork: boolean;
    loggedHours?: number;
}) {
    const canEdit = Boolean(currentUser && canEditProjectWorkItem(project, workItem, currentUser));
    const canDelete = Boolean(currentUser && canDeleteProjectWorkItem(project, workItem, currentUser));
    const assigneeIds = getWorkItemAssigneeIds(workItem);
    const assigneeNames = getWorkItemAssigneeNames(workItem);
    const canTakeWork = Boolean(currentUser && canContributeToProject(project, currentUser) && !assigneeIds.includes(currentUser.id));
    const priorityStyle = getPriorityStyles(workItem.priority);

    return (
        <article
            style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '1.25rem',
                boxShadow: '0 2px 4px rgba(15, 23, 42, 0.03)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                position: 'relative',
                cursor: canEdit ? 'pointer' : 'default',
            }}
            className="hover:shadow-md hover:-translate-y-1"
            onClick={(e) => {
                if (!canEdit) return;
                // prevent click if clicking a button
                if ((e.target as HTMLElement).closest('button')) return;
                onEdit();
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderRadius: '6px', padding: '0.2rem 0.5rem', background: '#f1f5f9', color: '#475569', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Layers3 size={12} />
                        {workItem.item_type}
                    </span>

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderRadius: '6px', padding: '0.2rem 0.5rem', background: priorityStyle.background, color: priorityStyle.color, border: `1px solid ${priorityStyle.border}`, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Flag size={12} />
                        {workItem.priority}
                    </span>
                </div>

                {canDelete && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.2rem', borderRadius: '4px', display: 'flex' }} className="hover:bg-red-50 hover:text-red-500" title="Delete item">
                        <Trash2 size={16} />
                    </button>
                )}
            </div>

            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>{workItem.title}</h3>
            
            {workItem.description && (
                <p style={{ margin: '0 0 1rem 0', color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {workItem.description}
                </p>
            )}

            {canTakeWork && (
                <div style={{ marginTop: '0.75rem' }}>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        isLoading={isTakingWork}
                        onClick={(event) => {
                            event.stopPropagation();
                            onTakeWork();
                        }}
                        style={{ width: '100%', justifyContent: 'center' }}
                    >
                        {assigneeIds.length > 0 ? 'Join Work' : 'Take Work'}
                    </Button>
                </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#64748b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }} title={assigneeNames.length > 0 ? `Assigned to ${assigneeNames.join(', ')}` : 'Unassigned'}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: assigneeIds.length > 0 ? '#e2e8f0' : 'transparent', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        {assigneeIds.length > 0 ? <UserIcon size={12} style={{ color: '#475569' }} /> : <UserIcon size={12} />}
                    </div>
                    {assigneeNames.length > 0 ? <span style={{ color: '#334155' }}>{formatAssigneeSummary(assigneeNames)}</span> : 'Unassigned'}
                </div>
                
                {workItem.due_date && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: new Date(workItem.due_date) < new Date() && workItem.status !== 'finished' ? '#ef4444' : '#64748b' }} title="Due date">
                        <Calendar size={13} />
                        {new Date(workItem.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                )}

                {loggedHours != null && loggedHours > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 700 }} title="Hours you logged against this item this week">
                        ⏱ {loggedHours % 1 === 0 ? loggedHours : loggedHours.toFixed(1)} hrs this week
                    </div>
                )}
            </div>
        </article>
    );
}
