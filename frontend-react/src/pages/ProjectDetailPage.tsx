import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    AlertCircle,
    ArrowLeft,
    Calendar,
    Flag,
    GripVertical,
    Layers3,
    Mail,
    Paperclip,
    Plus,
    ShieldCheck,
    Trash2,
    User as UserIcon,
    UserPlus,
    Users,
} from 'lucide-react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';

import { Navbar, Footer } from '../components/Layout';
import { Button, EmptyState, GuidancePanel, LoadingSpinner } from '../components/ui';
import { Logo } from '../components/Logo';
import FileUpload from '../components/FileUpload';
import { api } from '../lib/api';
import type { ChecklistItem, Project, ProjectJoinRequest, ProjectUserSummary, ProjectWorkItem, ProjectWorkItemCreate, User } from '../lib/api';
import {
    buildAssignableUsers,
    buildProjectTeamMembers,
    canAssignProjectWork,
    canContributeToProject,
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

const CARD_TEMPLATES: Array<{ label: string; icon: string; fields: Partial<WorkItemFormState> }> = [
    {
        label: 'Bug', icon: '🐛',
        fields: { item_type: 'issue', priority: 'high', title: '[Bug] ', description: '**Steps to reproduce:**\n1. \n\n**Expected behavior:**\n\n**Actual behavior:**' },
    },
    {
        label: 'Feature', icon: '✨',
        fields: { item_type: 'feature', priority: 'medium', title: '[Feature] ', description: '**Goal:**\n\n**Acceptance criteria:**\n- [ ] ' },
    },
    {
        label: 'Research', icon: '🔍',
        fields: { item_type: 'research', priority: 'low', title: '[Research] ', description: '**Question to answer:**\n\n**Key findings:**\n' },
    },
    {
        label: 'Design', icon: '🎨',
        fields: { item_type: 'design', priority: 'medium', title: '[Design] ', description: '**Design goal:**\n\n**Constraints:**\n' },
    },
];
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
    checklist: ChecklistItem[];
    blocked_by_ids: string[];
};

const EMPTY_WORK_ITEM_FORM: WorkItemFormState = {
    title: '',
    description: '',
    item_type: 'task',
    status: 'pending',
    priority: 'medium',
    assignee_ids: [],
    due_date: '',
    checklist: [],
    blocked_by_ids: [],
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

function ProjectUserAvatar({
    user,
    size = '2.75rem',
}: {
    user: Pick<ProjectUserSummary, 'name' | 'email' | 'picture' | 'invited_only'>;
    size?: string;
}) {
    const initials = getProjectUserInitials(user);

    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: '999px',
                background: '#e2e8f0',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                flexShrink: 0,
                overflow: 'hidden',
                position: 'relative',
            }}
            aria-hidden="true"
        >
            <span>{initials}</span>
            {user.picture && (
                <img
                    src={user.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                        event.currentTarget.remove();
                    }}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            )}
        </div>
    );
}

function getProjectRequestLabel(requestType: ProjectJoinRequest['request_type']) {
    if (requestType === 'lead') return 'Leadership Request';
    if (requestType === 'delete') return 'Delete Request';
    return 'Access Request';
}

type ProjectTabId = 'board' | 'team' | 'files' | 'requests';

type ProjectTab = { id: ProjectTabId; label: string; icon: ReactNode; count?: number; danger?: boolean };

type RequestTheme = {
    accent: string;
    badgeBg: string;
    badgeText: string;
};

function getProjectRequestTheme(requestType: ProjectJoinRequest['request_type']): RequestTheme {
    if (requestType === 'delete') {
        return { accent: '#dc2626', badgeBg: '#fee2e2', badgeText: '#b91c1c' };
    }
    if (requestType === 'lead') {
        return { accent: '#6366f1', badgeBg: '#eef2ff', badgeText: '#4338ca' };
    }
    return { accent: '#f59e0b', badgeBg: '#fef3e2', badgeText: '#b45309' };
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


function isSuggestedType(itemType: string) {
    return TYPE_SUGGESTIONS.includes(itemType);
}

function getPriorityBorderColor(priority: ProjectWorkItem['priority']): string {
    return { low: '#94a3b8', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' }[priority];
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
    const [descExpanded, setDescExpanded] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [rawActiveTab, setRawActiveTab] = useState<ProjectTabId>(() => {
        const fromUrl = searchParams.get('tab');
        return fromUrl === 'team' || fromUrl === 'files' || fromUrl === 'requests' ? fromUrl : 'board';
    });
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
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [boardView, setBoardView] = useState<'board' | 'calendar'>('board');
    const [calendarMonth, setCalendarMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
    const [descPreview, setDescPreview] = useState(false);
    const [showMoveDropdown, setShowMoveDropdown] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const [moveableProjects, setMoveableProjects] = useState<Project[]>([]);

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

    const uniqueItemTypes = useMemo(() => [...new Set(workItems.map((w) => w.item_type))].sort(), [workItems]);

    const filteredWorkItems = useMemo(() => workItems.filter((item) => {
        if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (filterType && item.item_type !== filterType) return false;
        if (filterPriority && item.priority !== filterPriority) return false;
        return true;
    }), [workItems, searchQuery, filterType, filterPriority]);

    const groupedWorkItems = STATUS_COLUMNS.map((column) => ({
        ...column,
        items: filteredWorkItems.filter((workItem) => workItem.status === column.value),
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
            checklist: workItem.checklist ?? [],
            blocked_by_ids: workItem.blocked_by_ids ?? [],
        });
        setShowEditor(true);
    };

    const closeEditor = () => {
        setShowEditor(false);
        setEditingWorkItem(null);
        setWorkItemForm(EMPTY_WORK_ITEM_FORM);
        setShowMoveDropdown(false);
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

        const reviewedJoinRequest = joinRequests.find((request) => request.id === joinRequestId);
        if (
            nextStatus === 'approved'
            && reviewedJoinRequest?.request_type === 'delete'
            && !window.confirm('Approving this deletes the entire project and all of its work items. This cannot be undone. Continue?')
        ) {
            return;
        }

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
                checklist: workItemForm.checklist,
                blocked_by_ids: workItemForm.blocked_by_ids.length > 0 ? workItemForm.blocked_by_ids : null,
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

    const handleQuickAddWorkItem = useCallback(async (status: ProjectWorkItem['status'], title: string) => {
        if (!projectId || !user) return;
        const newItem = await api.createProjectWorkItem(projectId, {
            title,
            description: null,
            item_type: 'task',
            status,
            priority: 'medium',
            assignee_ids: canManageWork ? [] : [user.id],
        });
        setWorkItems((prev) => [newItem, ...prev]);
    }, [projectId, user, canManageWork]);

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setDraggingId(event.active.id as string);
    }, []);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        setDraggingId(null);
        const { active, over } = event;
        if (!over || !projectId) return;
        const itemId = active.id as string;
        const newStatus = over.id as ProjectWorkItem['status'];
        const item = workItems.find((w) => w.id === itemId);
        if (!item || item.status === newStatus) return;
        const prevStatus = item.status;
        setWorkItems((prev) => prev.map((w) => w.id === itemId ? { ...w, status: newStatus } : w));
        try {
            await api.updateProjectWorkItem(projectId, itemId, { status: newStatus });
        } catch {
            setWorkItems((prev) => prev.map((w) => w.id === itemId ? { ...w, status: prevStatus } : w));
        }
    }, [workItems, projectId]);

    const handleToggleWatch = useCallback(async () => {
        if (!projectId || !editingWorkItem || !user) return;
        const isWatching = editingWorkItem.watcher_ids.includes(user.id);
        const updated = { ...editingWorkItem, watcher_ids: isWatching
            ? editingWorkItem.watcher_ids.filter((id) => id !== user.id)
            : [...editingWorkItem.watcher_ids, user.id],
        };
        setEditingWorkItem(updated);
        setWorkItems((prev) => prev.map((w) => w.id === editingWorkItem.id ? updated : w));
        try {
            const fresh = isWatching
                ? await api.unwatchWorkItem(projectId, editingWorkItem.id)
                : await api.watchWorkItem(projectId, editingWorkItem.id);
            setEditingWorkItem(fresh);
            setWorkItems((prev) => prev.map((w) => w.id === fresh.id ? fresh : w));
        } catch {
            setEditingWorkItem(editingWorkItem);
            setWorkItems((prev) => prev.map((w) => w.id === editingWorkItem.id ? editingWorkItem : w));
        }
    }, [editingWorkItem, projectId, user]);

    const handleOpenMoveDropdown = useCallback(async () => {
        if (moveableProjects.length === 0) {
            try {
                const all = await api.getProjects();
                setMoveableProjects(all.filter((p) => p.id !== projectId));
            } catch {
                setMoveableProjects([]);
            }
        }
        setShowMoveDropdown((v) => !v);
    }, [moveableProjects.length, projectId]);

    const handleMoveWorkItem = useCallback(async (targetProjectId: string) => {
        if (!projectId || !editingWorkItem) return;
        setIsMoving(true);
        setShowMoveDropdown(false);
        try {
            await api.moveWorkItem(projectId, editingWorkItem.id, targetProjectId);
            closeEditor();
            await loadData();
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Failed to move work item.');
        } finally {
            setIsMoving(false);
        }
    }, [projectId, editingWorkItem, loadData]);

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
    const canEditOpenWorkItem = Boolean(editingWorkItem && user && canEditProjectWorkItem(project, editingWorkItem, user));
    const isWorkItemReadOnly = Boolean(editingWorkItem && !canEditOpenWorkItem);

    const projectTabs: ProjectTab[] = [
        { id: 'board', label: 'Board', icon: <Layers3 size={15} /> },
        { id: 'team', label: 'Team', icon: <Users size={15} />, count: projectTeam.length },
    ];
    if (canContribute) {
        projectTabs.push({ id: 'files', label: 'Files', icon: <Paperclip size={15} /> });
    }
    if (canManageWork) {
        projectTabs.push({ id: 'requests', label: 'Requests', icon: <UserPlus size={15} />, count: pendingProjectRequests.length, danger: pendingProjectRequests.length > 0 });
    }

    // Fall back to Board if the URL points at a tab this user can't see.
    const activeTab: ProjectTabId = projectTabs.some((tab) => tab.id === rawActiveTab) ? rawActiveTab : 'board';
    const selectTab = (id: ProjectTabId) => {
        setRawActiveTab(id);
        setSearchParams((params) => {
            if (id === 'board') {
                params.delete('tab');
            } else {
                params.set('tab', id);
            }
            return params;
        }, { replace: true });
    };

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
                                    
                                    <h1 style={{ margin: '0 0 0.5rem 0', fontSize: 'clamp(1.6rem, 1.1rem + 1.6vw, 2.1rem)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.12 }}>
                                        {project.name}
                                    </h1>
                                    {project.description && (
                                        <div style={{ maxWidth: '760px' }}>
                                            <p style={{
                                                margin: 0, fontSize: '0.98rem', color: '#475467', lineHeight: 1.55,
                                                ...(descExpanded ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
                                            }}>
                                                {project.description}
                                            </p>
                                            {project.description.length > 200 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDescExpanded((value) => !value)}
                                                    style={{ marginTop: '0.3rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#4f46e5', fontWeight: 600, fontSize: '0.85rem' }}
                                                >
                                                    {descExpanded ? 'Show less' : 'Show more'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    
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

                                <div style={{ display: 'flex', alignItems: 'stretch', background: '#ffffff', border: '1px solid #edeff3', borderRadius: '14px', padding: '0.5rem 0.25rem', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', marginTop: '0.3rem' }}>
                                    {[
                                        { label: 'Team', value: projectTeam.length, accent: '#475467' },
                                        { label: 'Work items', value: workItems.length, accent: '#475467' },
                                        ...(canManageWork && pendingProjectRequests.length > 0
                                            ? [{ label: 'Requests', value: pendingProjectRequests.length, accent: '#b42318' }]
                                            : []),
                                    ].map((stat, index) => (
                                        <div key={stat.label} style={{ display: 'flex', alignItems: 'center' }}>
                                            {index > 0 && <div style={{ width: '1px', alignSelf: 'stretch', background: '#eef0f4', margin: '0.15rem 0' }} />}
                                            <div style={{ padding: '0.25rem 1rem', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.1, color: stat.accent }}>{stat.value}</div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{stat.label}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
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

                    <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid #e5e7eb', marginBottom: '1.75rem', overflowX: 'auto' }}>
                        {projectTabs.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => selectTab(tab.id)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.7rem 1rem', background: 'none', border: 'none', borderBottom: `2px solid ${active ? '#4f46e5' : 'transparent'}`, marginBottom: '-1px', color: active ? '#4f46e5' : '#667085', fontWeight: active ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
                                >
                                    {tab.icon}
                                    {tab.label}
                                    {typeof tab.count === 'number' && tab.count > 0 && (
                                        <span style={{ background: tab.danger ? '#fee2e2' : '#eef2ff', color: tab.danger ? '#b42318' : '#4f46e5', borderRadius: '999px', padding: '0.05rem 0.45rem', fontSize: '0.72rem', fontWeight: 700 }}>{tab.count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {activeTab === 'board' && (
                        <GuidancePanel
                            title="How This Project Board Works"
                            description="These short rules help volunteers understand what they can do from the board based on their current access."
                            items={projectBoardGuidelines}
                            icon={<Layers3 size={18} />}
                            tone="slate"
                            style={{ marginBottom: '2rem' }}
                        />
                    )}

                    {activeTab === 'team' && (
                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 4px 15px rgba(15, 23, 42, 0.04)', marginBottom: '2rem' }}>
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
                                                <ProjectUserAvatar user={member} />

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
                    )}

                    {activeTab === 'files' && canContribute && (
                        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 4px 15px rgba(15, 23, 42, 0.04)', marginBottom: '2rem' }}>
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

                    {/* Access request CTAs (shown on the Board tab for non-members) */}
                    {activeTab === 'board' && (canRequestAccess || canRequestLead) && (
                        <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                        </div>
                    )}

                    {activeTab === 'requests' && canManageWork && pendingProjectRequests.length > 0 && (() => {
                                const hasDeleteRequest = pendingProjectRequests.some((request) => request.request_type === 'delete');
                                return (
                                <div style={{ background: '#ffffff', borderRadius: '18px', border: '1px solid #edeff3', padding: '1.5rem 1.6rem', boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 12px 28px -12px rgba(16,24,40,0.10)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.15rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', background: '#eef2ff', color: '#4f46e5' }}>
                                                <UserPlus size={18} />
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Pending Requests</h3>
                                                <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: '#98a2b3' }}>People asking to join, lead, or remove this project</p>
                                            </div>
                                        </div>
                                        <span style={{ background: '#f2f4f7', color: '#475467', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>
                                            {pendingProjectRequests.length}
                                        </span>
                                    </div>

                                    {hasDeleteRequest && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.6rem 0.8rem', borderRadius: '10px', background: '#fef6f6', border: '1px solid #fbe0e0', color: '#b42318', fontSize: '0.8rem', fontWeight: 500 }}>
                                            <AlertCircle size={15} style={{ flexShrink: 0 }} />
                                            <span>Approving a <strong>delete request</strong> permanently removes this project and all of its work items. This can’t be undone.</span>
                                        </div>
                                    )}

                                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                                        {pendingProjectRequests.map((joinRequest) => {
                                            const theme = getProjectRequestTheme(joinRequest.request_type);
                                            const isDelete = joinRequest.request_type === 'delete';
                                            const isReviewing = reviewingRequestId === joinRequest.id;
                                            return (
                                                <div key={joinRequest.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', position: 'relative', overflow: 'hidden', background: '#ffffff', border: '1px solid #edeff3', borderRadius: '14px', padding: '0.95rem 1.1rem 0.95rem 1.25rem' }}>
                                                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: theme.accent }} aria-hidden="true" />
                                                    <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', minWidth: 0, flex: '1 1 260px' }}>
                                                        <div style={{ width: '2.6rem', height: '2.6rem', borderRadius: '999px', background: theme.badgeBg, color: theme.badgeText, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }} aria-hidden="true">
                                                            {getProjectUserInitials({ name: joinRequest.user_name, email: joinRequest.user_email })}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                <span style={{ fontWeight: 700, color: '#101828', fontSize: '0.95rem' }}>{joinRequest.user_name}</span>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.18rem 0.55rem', background: theme.badgeBg, color: theme.badgeText, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                                    {getProjectRequestLabel(joinRequest.request_type)}
                                                                </span>
                                                            </div>
                                                            <div style={{ color: '#667085', fontSize: '0.82rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Mail size={13} /> {joinRequest.user_email}</span>
                                                                <span style={{ color: '#d0d5dd' }}>•</span>
                                                                <span>Requested {formatShortDate(joinRequest.requested_at)}</span>
                                                            </div>
                                                            {joinRequest.message && (
                                                                <div style={{ marginTop: '0.55rem', padding: '0.5rem 0.7rem', background: '#f9fafb', borderRadius: '8px', borderLeft: '2px solid #e4e7ec', color: '#475467', fontSize: '0.86rem', fontStyle: 'italic', lineHeight: 1.45 }}>
                                                                    “{joinRequest.message}”
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                                        <Button type="button" size="sm" variant="outline" onClick={() => handleReviewJoinRequest(joinRequest.id, 'declined')} disabled={isReviewing} style={{ borderColor: '#e4e7ec', color: '#475467' }} className="hover:bg-slate-50">
                                                            Decline
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => handleReviewJoinRequest(joinRequest.id, 'approved')}
                                                            disabled={isReviewing}
                                                            isLoading={isReviewing}
                                                            style={{ background: isDelete ? '#dc2626' : '#3b82f6' }}
                                                        >
                                                            {isDelete ? 'Approve & Delete' : 'Approve'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                );
                            })()}

                    {activeTab === 'requests' && canManageWork && pendingProjectRequests.length === 0 && (
                        <EmptyState
                            icon={<UserPlus size={36} />}
                            title="No pending requests"
                            description="When volunteers ask to join, lead, or remove this project, their requests will show up here for review."
                        />
                    )}

                    {/* Search / filter bar */}
                    {activeTab === 'board' && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
                            {/* View toggle */}
                            <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                                {(['board', 'calendar'] as const).map((v) => (
                                    <button key={v} type="button" onClick={() => setBoardView(v)}
                                        style={{ padding: '0.38rem 0.7rem', fontSize: '0.78rem', fontWeight: boardView === v ? 700 : 400, background: boardView === v ? '#0f172a' : 'transparent', color: boardView === v ? '#fff' : '#64748b', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        {v === 'board' ? '⬛ Board' : '📅 Calendar'}
                                    </button>
                                ))}
                            </div>
                            <div style={{ position: 'relative', flex: '1 1 180px' }}>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search cards…"
                                    style={{ width: '100%', padding: '0.4rem 0.75rem 0.4rem 2rem', fontSize: '0.82rem', border: '1px solid #e2e8f0', borderRadius: '6px', outline: 'none', fontFamily: 'inherit', background: '#f8fafc', boxSizing: 'border-box' }}
                                    onFocus={e => (e.currentTarget.style.borderColor = '#94a3b8')}
                                    onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                                />
                                <span style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', display: 'flex' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                                </span>
                            </div>
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                                <option value="">All types</option>
                                {uniqueItemTypes.map((t) => <option key={t} value={t}>{formatTagLabel(t)}</option>)}
                            </select>
                            <select
                                value={filterPriority}
                                onChange={(e) => setFilterPriority(e.target.value)}
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                                <option value="">All priorities</option>
                                {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                            {(searchQuery || filterType || filterPriority) && (
                                <button
                                    type="button"
                                    onClick={() => { setSearchQuery(''); setFilterType(''); setFilterPriority(''); }}
                                    style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: 'none', cursor: 'pointer', color: '#64748b' }}
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    )}

                    {/* Calendar View */}
                    {activeTab === 'board' && boardView === 'calendar' && (
                        <CalendarView
                            workItems={filteredWorkItems}
                            month={calendarMonth}
                            onMonthChange={setCalendarMonth}
                            onEditItem={openEditModal}
                        />
                    )}

                    {/* Kanban Board */}
                    {activeTab === 'board' && boardView === 'board' && <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', alignItems: 'flex-start', paddingBottom: '1rem' }}>
                            {groupedWorkItems.map((column) => (
                                <BoardColumn
                                    key={column.value}
                                    column={column}
                                    project={project}
                                    currentUser={user}
                                    canContribute={canContribute}
                                    draggingId={draggingId}
                                    takingWorkItemId={takingWorkItemId}
                                    myWorkItemHours={myWorkItemHours}
                                    onEdit={openEditModal}
                                    onTakeWork={handleTakeWorkItem}
                                    onDelete={handleDeleteWorkItem}
                                    onQuickAdd={(title) => handleQuickAddWorkItem(column.value, title)}
                                />
                            ))}
                        </div>

                        <DragOverlay dropAnimation={null}>
                            {draggingId ? (() => {
                                const item = workItems.find((w) => w.id === draggingId);
                                return item ? (
                                    <div style={{
                                        background: '#ffffff',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        borderLeft: `3px solid ${getPriorityBorderColor(item.priority)}`,
                                        padding: '0.55rem 0.65rem',
                                        boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
                                        fontSize: '0.83rem',
                                        fontWeight: 600,
                                        color: '#0f172a',
                                        width: '240px',
                                        cursor: 'grabbing',
                                        rotate: '2deg',
                                    }}>
                                        {item.title}
                                    </div>
                                ) : null;
                            })() : null}
                        </DragOverlay>
                    </DndContext>}
                </div>
            </main>
            <Footer />

            {/* Editor Drawer */}
            {showEditor && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 1000 }} onClick={closeEditor}>
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '440px', maxWidth: '100vw', overflowY: 'auto', overflowX: 'hidden', background: '#ffffff', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', animation: 'slideInFromRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)', padding: '2rem', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                                    {editingWorkItem ? (isWorkItemReadOnly ? 'Work Item' : 'Edit Work Item') : 'New Work Item'}
                                </h2>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {editingWorkItem && (() => {
                                    const isWatching = editingWorkItem.watcher_ids.includes(user?.id || '');
                                    return (
                                        <button
                                            type="button"
                                            onClick={handleToggleWatch}
                                            title={isWatching ? 'Stop watching this card' : 'Watch — get notified when status changes'}
                                            style={{ background: isWatching ? '#f0fdf4' : 'none', border: `1px solid ${isWatching ? '#86efac' : '#e2e8f0'}`, color: isWatching ? '#16a34a' : '#94a3b8', cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600 }}
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill={isWatching ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                            {isWatching ? 'Watching' : 'Watch'}
                                        </button>
                                    );
                                })()}
                                {editingWorkItem && canManageWork && (
                                    <div style={{ position: 'relative' }}>
                                        <button
                                            type="button"
                                            onClick={handleOpenMoveDropdown}
                                            disabled={isMoving}
                                            title="Move to another project"
                                            style={{ background: 'none', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600 }}
                                        >
                                            ↗ Move
                                        </button>
                                        {showMoveDropdown && (
                                            <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: '200px', maxHeight: '220px', overflowY: 'auto' }}>
                                                {moveableProjects.length === 0 ? (
                                                    <div style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#94a3b8' }}>No other projects</div>
                                                ) : moveableProjects.map((p) => (
                                                    <button key={p.id} type="button" onClick={() => handleMoveWorkItem(p.id)}
                                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 1rem', fontSize: '0.82rem', color: '#0f172a', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                                                        onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                                                        onMouseOut={e => (e.currentTarget.style.background = 'none')}
                                                    >
                                                        {p.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <button type="button" onClick={closeEditor} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex' }} className="hover:bg-slate-100 hover:text-slate-700">
                                    <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={isWorkItemReadOnly ? (event) => event.preventDefault() : handleSaveWorkItem} style={{ minWidth: 0 }}>
                            <fieldset disabled={isWorkItemReadOnly} style={{ display: 'grid', gap: '1.25rem', border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                                {!editingWorkItem && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Start from template</label>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            {CARD_TEMPLATES.map((template) => (
                                                <button key={template.label} type="button"
                                                    onClick={() => setWorkItemForm((c) => ({ ...c, ...template.fields }))}
                                                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', background: '#f8fafc' }}>
                                                    {template.icon} {template.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
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
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <label htmlFor="project-work-item-description" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Description</label>
                                        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                                            {(['Write', 'Preview'] as const).map((tab) => (
                                                <button key={tab} type="button" onClick={() => setDescPreview(tab === 'Preview')}
                                                    style={{ padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: (tab === 'Preview') === descPreview ? '#0f172a' : 'transparent', color: (tab === 'Preview') === descPreview ? '#fff' : '#64748b' }}>
                                                    {tab}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {descPreview ? (
                                        <div style={{ minHeight: '100px', padding: '0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.875rem', color: '#334155', lineHeight: 1.6 }}>
                                            {workItemForm.description ? <ReactMarkdown>{workItemForm.description}</ReactMarkdown> : <span style={{ color: '#94a3b8' }}>Nothing to preview</span>}
                                        </div>
                                    ) : (
                                        <textarea
                                            id="project-work-item-description"
                                            className="form-textarea"
                                            rows={4}
                                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}
                                            value={workItemForm.description}
                                            onChange={(event) => setWorkItemForm((current) => ({ ...current, description: event.target.value }))}
                                            placeholder="Supports **markdown** formatting…"
                                        />
                                    )}
                                </div>

                                {/* Checklist */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                                            Checklist
                                            {workItemForm.checklist.length > 0 && (
                                                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                                                    {workItemForm.checklist.filter(c => c.checked).length}/{workItemForm.checklist.length}
                                                </span>
                                            )}
                                        </label>
                                    </div>
                                    {workItemForm.checklist.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
                                            {workItemForm.checklist.map((item) => (
                                                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={item.checked}
                                                        onChange={() => setWorkItemForm((current) => ({
                                                            ...current,
                                                            checklist: current.checklist.map((c) =>
                                                                c.id === item.id ? { ...c, checked: !c.checked } : c
                                                            ),
                                                        }))}
                                                        style={{ cursor: 'pointer', flexShrink: 0 }}
                                                    />
                                                    <span style={{ minWidth: 0, fontSize: '0.85rem', color: item.checked ? '#94a3b8' : '#334155', textDecoration: item.checked ? 'line-through' : 'none', overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.4 }}>
                                                        {item.text}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setWorkItemForm((current) => ({
                                                            ...current,
                                                            checklist: current.checklist.filter((c) => c.id !== item.id),
                                                        }))}
                                                        style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.1rem', display: 'flex', borderRadius: '3px', flexShrink: 0 }}
                                                        onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                                                        onMouseOut={e => (e.currentTarget.style.color = '#cbd5e1')}
                                                    >
                                                        <Plus size={12} style={{ transform: 'rotate(45deg)' }} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <ChecklistQuickAdd
                                        onAdd={(text) => {
                                            const newItem: ChecklistItem = {
                                                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                                text,
                                                checked: false,
                                                created_at: new Date().toISOString(),
                                            };
                                            setWorkItemForm((current) => ({
                                                ...current,
                                                checklist: [...current.checklist, newItem],
                                            }));
                                        }}
                                    />
                                </div>



                                {/* Activity log */}
                                {editingWorkItem && editingWorkItem.activity_log.length > 0 && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>Activity</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                                            {[...editingWorkItem.activity_log].reverse().map((entry, i) => (
                                                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.8rem' }}>
                                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#e2e8f0', color: '#475569', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                                                        {entry.user_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontWeight: 700, color: '#334155' }}>{entry.user_name}</span>
                                                        <span style={{ color: '#64748b' }}> {entry.action}</span>
                                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                                                            {new Date(entry.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                            </fieldset>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
                                <Button type="button" variant="ghost" onClick={closeEditor}>{isWorkItemReadOnly ? 'Close' : 'Cancel'}</Button>
                                {!isWorkItemReadOnly && (
                                    <Button type="submit" isLoading={isSaving} style={{ boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)' }}>
                                        {editingWorkItem ? 'Save Changes' : 'Create Item'}
                                    </Button>
                                )}
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

function CalendarView({
    workItems,
    month,
    onMonthChange,
    onEditItem,
}: {
    workItems: ProjectWorkItem[];
    month: Date;
    onMonthChange: (m: Date) => void;
    onEditItem: (item: ProjectWorkItem) => void;
}) {
    const year = month.getFullYear();
    const monthIdx = month.getMonth();
    const firstDay = new Date(year, monthIdx, 1).getDay();
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const today = new Date();

    const itemsByDate = useMemo(() => {
        const map: Record<string, ProjectWorkItem[]> = {};
        workItems.forEach((item) => {
            if (!item.due_date) return;
            const d = new Date(item.due_date);
            if (d.getFullYear() === year && d.getMonth() === monthIdx) {
                const key = d.getDate().toString();
                if (!map[key]) map[key] = [];
                map[key].push(item);
            }
        });
        return map;
    }, [workItems, year, monthIdx]);

    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);

    const prevMonth = () => onMonthChange(new Date(year, monthIdx - 1, 1));
    const nextMonth = () => onMonthChange(new Date(year, monthIdx + 1, 1));

    const priorityColor: Record<string, string> = { urgent: '#dc2626', high: '#f97316', medium: '#3b82f6', low: '#94a3b8' };
    const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return (
        <div style={{ marginBottom: '1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                <button type="button" onClick={prevMonth} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', color: '#475569', fontSize: '0.85rem' }}>‹</button>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', minWidth: '160px', textAlign: 'center' }}>{monthLabel}</span>
                <button type="button" onClick={nextMonth} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', color: '#475569', fontSize: '0.85rem' }}>›</button>
            </div>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', padding: '0.25rem 0' }}>{d}</div>
                ))}
            </div>
            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {cells.map((day, idx) => {
                    const isToday = day !== null && today.getFullYear() === year && today.getMonth() === monthIdx && today.getDate() === day;
                    const items = day !== null ? (itemsByDate[day.toString()] ?? []) : [];
                    return (
                        <div key={idx} style={{ minHeight: '72px', background: day === null ? 'transparent' : '#f8fafc', border: day === null ? 'none' : `1px solid ${isToday ? '#3b82f6' : '#e2e8f0'}`, borderRadius: '6px', padding: '0.3rem', position: 'relative' }}>
                            {day !== null && (
                                <>
                                    <div style={{ fontSize: '0.72rem', fontWeight: isToday ? 800 : 500, color: isToday ? '#3b82f6' : '#64748b', marginBottom: '0.2rem' }}>{day}</div>
                                    {items.slice(0, 3).map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => onEditItem(item)}
                                            title={item.title}
                                            style={{ fontSize: '0.65rem', lineHeight: 1.3, padding: '0.15rem 0.3rem', borderRadius: '3px', marginBottom: '2px', background: priorityColor[item.priority] + '22', borderLeft: `2px solid ${priorityColor[item.priority]}`, color: '#0f172a', cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                                        >
                                            {item.title}
                                        </div>
                                    ))}
                                    {items.length > 3 && (
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>+{items.length - 3} more</div>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function BoardColumn({
    column, project, currentUser, canContribute, draggingId, takingWorkItemId, myWorkItemHours,
    onEdit, onTakeWork, onDelete, onQuickAdd,
}: {
    column: typeof STATUS_COLUMNS[number] & { items: ProjectWorkItem[] };
    project: Project;
    currentUser: User | null;
    canContribute: boolean;
    draggingId: string | null;
    takingWorkItemId: string | null;
    myWorkItemHours: Record<string, number>;
    onEdit: (item: ProjectWorkItem) => void;
    onTakeWork: (item: ProjectWorkItem) => void;
    onDelete: (item: ProjectWorkItem) => void;
    onQuickAdd: (title: string) => Promise<void>;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: column.value });
    return (
        <div
            ref={setNodeRef}
            style={{
                flexShrink: 0, width: '260px', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                borderRadius: '10px', padding: '0.4rem 0.4rem 0.5rem',
                background: isOver ? '#f0f9ff' : 'transparent',
                outline: isOver ? '2px dashed #93c5fd' : '2px dashed transparent',
                transition: 'background 0.15s, outline 0.15s',
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0 0.45rem', borderBottom: `2px solid ${column.accent}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: column.accent, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{column.label}</span>
                </div>
                <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.05rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {column.items.length}
                </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minHeight: '4rem' }}>
                {column.items.map((workItem) => (
                    <WorkItemCard
                        key={workItem.id}
                        workItem={workItem}
                        project={project}
                        currentUser={currentUser}
                        onEdit={() => onEdit(workItem)}
                        onTakeWork={() => onTakeWork(workItem)}
                        onDelete={() => onDelete(workItem)}
                        isTakingWork={takingWorkItemId === workItem.id}
                        loggedHours={myWorkItemHours[workItem.id]}
                        isDragging={draggingId === workItem.id}
                    />
                ))}
                {column.items.length === 0 && (
                    <div style={{ border: '1px dashed #e2e8f0', borderRadius: '8px', padding: '1.5rem 1rem', textAlign: 'center', color: '#cbd5e1', fontSize: '0.8rem' }}>
                        No items
                    </div>
                )}
            </div>

            {/* Quick-add */}
            {canContribute && <QuickAddCard onAdd={onQuickAdd} />}
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
    isDragging,
}: {
    workItem: ProjectWorkItem;
    project: Project;
    currentUser: User | null;
    onEdit: () => void;
    onTakeWork: () => void;
    onDelete: () => void;
    isTakingWork: boolean;
    loggedHours?: number;
    isDragging?: boolean;
}) {
    const [hovered, setHovered] = useState(false);
    const canDelete = Boolean(currentUser && canDeleteProjectWorkItem(project, workItem, currentUser));
    const assigneeIds = getWorkItemAssigneeIds(workItem);
    const assigneeNames = getWorkItemAssigneeNames(workItem);
    const canTakeWork = Boolean(currentUser && canContributeToProject(project, currentUser) && !assigneeIds.includes(currentUser.id));
    const borderColor = getPriorityBorderColor(workItem.priority);
    const isOverdue = workItem.due_date && new Date(workItem.due_date) < new Date() && workItem.status !== 'finished';

    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: workItem.id });

    return (
        <article
            ref={setNodeRef}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, [data-drag-handle]')) return;
                onEdit();
            }}
            style={{
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                borderLeft: `3px solid ${borderColor}`,
                padding: '0.55rem 0.65rem',
                boxShadow: hovered ? '0 4px 10px rgba(15,23,42,0.09)' : '0 1px 2px rgba(15,23,42,0.04)',
                transform: transform ? CSS.Translate.toString(transform) : (hovered ? 'translateY(-1px)' : 'none'),
                transition: transform ? undefined : 'box-shadow 0.15s, transform 0.15s',
                cursor: 'pointer',
                position: 'relative',
                opacity: isDragging ? 0.35 : 1,
            }}
        >
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem', marginBottom: '0.35rem' }}>
                <div
                    data-drag-handle
                    {...attributes}
                    {...listeners}
                    style={{ color: '#d1d5db', cursor: 'grab', display: 'flex', alignItems: 'center', flexShrink: 0, marginTop: '2px', touchAction: 'none' }}
                    onMouseOver={e => (e.currentTarget.style.color = '#94a3b8')}
                    onMouseOut={e => (e.currentTarget.style.color = '#d1d5db')}
                    title="Drag to move"
                >
                    <GripVertical size={12} />
                </div>
                <p style={{
                    margin: 0, flex: 1,
                    fontSize: '0.83rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.35,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                    {workItem.title}
                </p>
                {canDelete && hovered && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 0, borderRadius: '3px', display: 'flex', flexShrink: 0, marginTop: '1px' }}
                        onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseOut={e => (e.currentTarget.style.color = '#cbd5e1')}
                        title="Delete"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
            </div>

            {/* Meta row: type + assignee avatar + due date + hours */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {workItem.item_type}
                </span>
                <div style={{ flex: 1 }} />
                {assigneeNames.length > 0 ? (
                    <div
                        title={assigneeNames.join(', ')}
                        style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#e2e8f0', color: '#475569', fontSize: '0.58rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                        {assigneeNames[0].charAt(0).toUpperCase()}
                        {assigneeNames.length > 1 && <span style={{ fontSize: '0.5rem' }}>+{assigneeNames.length - 1}</span>}
                    </div>
                ) : (
                    <div title="Unassigned" style={{ width: '18px', height: '18px', borderRadius: '50%', border: '1px dashed #cbd5e1', color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <UserIcon size={10} />
                    </div>
                )}
                {workItem.due_date && (
                    <span style={{ fontSize: '0.66rem', color: isOverdue ? '#ef4444' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.18rem', fontWeight: isOverdue ? 700 : 400 }}>
                        <Calendar size={10} />
                        {new Date(workItem.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                )}
                {loggedHours != null && loggedHours > 0 && (
                    <span title="Hours logged this week" style={{ fontSize: '0.62rem', fontWeight: 700, color: '#854d0e', background: '#fef9c3', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                        ⏱{loggedHours % 1 === 0 ? loggedHours : loggedHours.toFixed(1)}h
                    </span>
                )}
            </div>

            {/* Checklist progress */}
            {workItem.checklist.length > 0 && (
                <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ flex: 1, height: '3px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: '#10b981', borderRadius: '2px', width: `${Math.round((workItem.checklist.filter(c => c.checked).length / workItem.checklist.length) * 100)}%`, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, flexShrink: 0 }}>
                        {workItem.checklist.filter(c => c.checked).length}/{workItem.checklist.length}
                    </span>
                </div>
            )}

            {/* Blocked-by indicator */}
            {(workItem.blocked_by_ids?.length ?? 0) > 0 && (
                <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#b91c1c', background: '#fee2e2', padding: '0.1rem 0.4rem', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        ⛔ Blocked by {workItem.blocked_by_ids.length}
                    </span>
                </div>
            )}

            {/* Take Work — shown below meta row when applicable */}
            {canTakeWork && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTakeWork(); }}
                    disabled={isTakingWork}
                    style={{
                        marginTop: '0.4rem', width: '100%', padding: '0.3rem',
                        background: 'transparent', border: '1px dashed #cbd5e1',
                        borderRadius: '5px', color: '#64748b', cursor: 'pointer',
                        fontSize: '0.72rem', fontWeight: 600, transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.color = '#334155'; e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; }}
                >
                    {isTakingWork ? '...' : assigneeIds.length > 0 ? '+ Join Work' : '+ Take Work'}
                </button>
            )}
        </article>
    );
}

function QuickAddCard({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const [saving, setSaving] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (open) textareaRef.current?.focus();
    }, [open]);

    const submit = async () => {
        const title = value.trim();
        if (!title) { setOpen(false); setValue(''); return; }
        setSaving(true);
        try {
            await onAdd(title);
            setValue('');
        } catch {
            // keep open on error so user can retry
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.25rem', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.78rem', borderRadius: '6px', transition: 'color 0.15s' }}
                onMouseOver={e => e.currentTarget.style.color = '#475569'}
                onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
            >
                <Plus size={13} /> Add card
            </button>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                    if (e.key === 'Escape') { setOpen(false); setValue(''); }
                }}
                placeholder="Card title… (Enter to add)"
                rows={2}
                style={{ width: '100%', padding: '0.45rem 0.55rem', borderRadius: '6px', border: '1px solid #94a3b8', fontSize: '0.82rem', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                    type="button"
                    onClick={submit}
                    disabled={saving || !value.trim()}
                    style={{ flex: 1, padding: '0.35rem', borderRadius: '5px', background: '#0f172a', color: 'white', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', opacity: saving || !value.trim() ? 0.5 : 1 }}
                >
                    {saving ? '…' : 'Add'}
                </button>
                <button
                    type="button"
                    onClick={() => { setOpen(false); setValue(''); }}
                    style={{ padding: '0.35rem 0.6rem', borderRadius: '5px', background: 'none', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', fontSize: '0.78rem' }}
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

function ChecklistQuickAdd({ onAdd }: { onAdd: (text: string) => void }) {
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const submit = () => {
        const text = value.trim();
        if (!text) return;
        onAdd(text);
        setValue('');
        inputRef.current?.focus();
    };

    return (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); submit(); }
                }}
                placeholder="Add a checklist item… (Enter)"
                style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.82rem', border: '1px solid #e2e8f0', borderRadius: '6px', outline: 'none', fontFamily: 'inherit', background: '#f8fafc' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#94a3b8')}
                onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
            />
            <button
                type="button"
                onClick={submit}
                disabled={!value.trim()}
                style={{ padding: '0.4rem 0.7rem', borderRadius: '6px', background: '#0f172a', color: 'white', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', opacity: value.trim() ? 1 : 0.4 }}
            >
                <Plus size={13} />
            </button>
        </div>
    );
}
