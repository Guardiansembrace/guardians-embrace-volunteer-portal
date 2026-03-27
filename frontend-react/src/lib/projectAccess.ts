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

export function canViewProject(_project: Project, _user: User) {
    return true;
}

export function canManageProjectWork(project: Project, user: User) {
    return user.role === 'admin' || user.role === 'team_lead' || isProjectLead(project, user);
}

export function canContributeToProject(project: Project, user: User) {
    return canManageProjectWork(project, user) || isProjectMember(project, user);
}

export function canAssignProjectWork(project: Project, user: User) {
    return canContributeToProject(project, user);
}

export function canEditProjectWorkItem(project: Project, workItem: ProjectWorkItem, user: User) {
    if (canManageProjectWork(project, user)) {
        return true;
    }

    return isProjectTeamMember(project, user) && workItem.assignee_id === user.id;
}

export function canDeleteProjectWorkItem(project: Project, _workItem: ProjectWorkItem, user: User) {
    return canManageProjectWork(project, user);
}

export function canEditProjectTags(project: Project, user: User) {
    return canManageProjectWork(project, user);
}

export function canRequestProjectAccess(project: Project, user: User) {
    return !canContributeToProject(project, user);
}

export function getLatestJoinRequest(joinRequests: ProjectJoinRequest[]) {
    return [...joinRequests].sort((left, right) => (
        new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime()
    ))[0];
}

export function buildAssignableUsers(project: Project) {
    const seen = new Map<string, ProjectUserSummary>();

    if (project.lead) {
        seen.set(project.lead.id, project.lead);
    }

    for (const member of project.members) {
        seen.set(member.id, member);
    }

    return Array.from(seen.values()).sort((left, right) => left.name.localeCompare(right.name));
}
