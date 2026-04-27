import type { Project, ProjectJoinRequest, ProjectWorkItem, ProjectUserSummary, User } from './api';

export type RoleTagValue = 'volunteer' | 'team_lead' | 'admin';

const ROLE_TAG_OPTIONS: RoleTagValue[] = ['volunteer', 'team_lead', 'admin'];

export function isRoleTag(tag: string): tag is RoleTagValue {
    return ROLE_TAG_OPTIONS.includes(tag as RoleTagValue);
}

export function formatTagLabel(tag: string) {
    return tag
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function normalizeProjectTags(tags: string[] = []) {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const tag of tags) {
        const trimmed = tag.trim();
        if (!trimmed) continue;

        const lower = trimmed.toLowerCase();
        const normalizedTag = isRoleTag(lower) ? lower : trimmed;
        const dedupeKey = normalizedTag.toLowerCase();

        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        normalized.push(normalizedTag);
    }

    return normalized;
}

export function getRoleTags(tags: string[] = []) {
    return normalizeProjectTags(tags).filter((tag): tag is RoleTagValue => isRoleTag(tag));
}

export function getNonRoleTags(tags: string[] = []) {
    return normalizeProjectTags(tags).filter((tag) => !isRoleTag(tag.toLowerCase()));
}

export function isProjectLead(project: Project, user: Pick<User, 'id'>) {
    return project.lead?.id === user.id;
}

export function isProjectMember(project: Project, user: Pick<User, 'id'>) {
    return project.members.some((member) => member.id === user.id);
}

export function isProjectTeamMember(project: Project, user: Pick<User, 'id'>) {
    return isProjectLead(project, user) || isProjectMember(project, user);
}

export function canViewProject(project: Project, user: User) {
    void project;
    void user;
    return true;
}

function hasProjectManagementScope(user: Pick<User, 'role' | 'admin_access'>) {
    return user.role === 'admin'
        || user.role === 'team_lead'
        || Boolean(user.admin_access?.scopes?.includes('manage_projects'));
}

export function canDirectlyDeleteProject(user: Pick<User, 'role' | 'admin_access'>) {
    return hasProjectManagementScope(user);
}

export function canManageProjectWork(project: Project, user: User) {
    return hasProjectManagementScope(user) || isProjectLead(project, user);
}

export function canContributeToProject(project: Project, user: User) {
    return canManageProjectWork(project, user) || isProjectMember(project, user);
}

export function canAssignProjectWork(project: Project, user: User) {
    return canContributeToProject(project, user);
}

export function getWorkItemAssigneeIds(workItem: ProjectWorkItem) {
    const assigneeIds = (workItem.assignee_ids ?? []).filter(Boolean);
    if (assigneeIds.length > 0) return assigneeIds;
    return workItem.assignee_id ? [workItem.assignee_id] : [];
}

export function getWorkItemAssigneeNames(workItem: ProjectWorkItem) {
    const assigneeNames = (workItem.assignee_names ?? []).filter(Boolean);
    if (assigneeNames.length > 0) return assigneeNames;
    return workItem.assignee_name ? [workItem.assignee_name] : [];
}

export function canEditProjectWorkItem(project: Project, workItem: ProjectWorkItem, user: User) {
    if (canManageProjectWork(project, user)) {
        return true;
    }

    return isProjectTeamMember(project, user) && getWorkItemAssigneeIds(workItem).includes(user.id);
}

export function canDeleteProjectWorkItem(project: Project, workItem: ProjectWorkItem, user: User) {
    void workItem;
    return canManageProjectWork(project, user);
}

export function canEditProjectTags(project: Project, user: User) {
    return canManageProjectWork(project, user);
}

export function canRequestProjectAccess(project: Project, user: User) {
    return !canContributeToProject(project, user);
}

export function canRequestProjectLeadership(project: Project, user: User) {
    return !hasProjectManagementScope(user) && !isProjectLead(project, user);
}

export function canRequestProjectDeletion(project: Project, user: User) {
    void project;
    return !hasProjectManagementScope(user);
}

export function getLatestJoinRequest(
    joinRequests: ProjectJoinRequest[],
    requestType?: ProjectJoinRequest['request_type']
) {
    const matchingRequests = requestType
        ? joinRequests.filter((joinRequest) => joinRequest.request_type === requestType)
        : joinRequests;

    return [...matchingRequests].sort((left, right) => (
        new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime()
    ))[0];
}

function sortProjectUsersByName(left: ProjectUserSummary, right: ProjectUserSummary) {
    const leftLabel = left.name || left.email;
    const rightLabel = right.name || right.email;
    return leftLabel.localeCompare(rightLabel);
}

export function buildProjectTeamMembers(project: Project) {
    const seen = new Map<string, ProjectUserSummary>();

    if (project.lead) {
        seen.set(project.lead.id, project.lead);
    }

    for (const member of project.members) {
        if (!seen.has(member.id)) {
            seen.set(member.id, member);
        }
    }

    if (!project.lead) {
        return Array.from(seen.values()).sort(sortProjectUsersByName);
    }

    const otherMembers = Array.from(seen.values())
        .filter((member) => member.id !== project.lead?.id)
        .sort(sortProjectUsersByName);

    return [project.lead, ...otherMembers];
}

export function buildAssignableUsers(project: Project) {
    return [...buildProjectTeamMembers(project)].sort(sortProjectUsersByName);
}
