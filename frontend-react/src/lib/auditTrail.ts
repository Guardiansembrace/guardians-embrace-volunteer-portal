import { format, formatDistanceToNowStrict, isAfter, parseISO, subDays } from 'date-fns';
import type { AuditLogEntry } from './api';

export type AuditArea =
    | 'authentication'
    | 'users'
    | 'invites'
    | 'submissions'
    | 'projects'
    | 'work_items'
    | 'join_requests'
    | 'settings'
    | 'notifications'
    | 'comments'
    | 'files'
    | 'admin_access'
    | 'system';

export type AuditTimeFilter = 'all' | '24h' | '7d' | '30d';

const AREA_LABELS: Record<AuditArea, string> = {
    authentication: 'Authentication',
    users: 'Users',
    invites: 'Invites',
    submissions: 'Weekly Updates',
    projects: 'Projects',
    work_items: 'Work Items',
    join_requests: 'Join Requests',
    settings: 'Settings',
    notifications: 'Reminders',
    comments: 'Comments',
    files: 'Files',
    admin_access: 'Delegated Access',
    system: 'System',
};

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readRequestedWeek(log: AuditLogEntry): string | undefined {
    return readString(readRecord(log.metadata.query)?.week_id);
}

function titleCase(value: string): string {
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getAuditArea(log: AuditLogEntry): AuditArea {
    const path = log.path ?? '';

    if (log.event_type === 'admin_access' || log.resource_type === 'admin_access_grant') return 'admin_access';
    if (log.action.startsWith('auth.') || path.includes('/auth/')) return 'authentication';
    if (path.includes('/notifications/')) return 'notifications';
    if (path.includes('/users/')) return 'users';
    if (path.includes('/invites')) return 'invites';
    if (path.includes('/submissions/')) return 'submissions';
    if (path.includes('/work-items')) return 'work_items';
    if (path.includes('/join-requests')) return 'join_requests';
    if (path.includes('/projects')) return 'projects';
    if (path.includes('/settings')) return 'settings';
    if (path.includes('/comments')) return 'comments';
    if (path.includes('/files')) return 'files';
    return 'system';
}

export function getAuditAreaLabel(area: AuditArea): string {
    return AREA_LABELS[area];
}

export function getAuditActorLabel(log: AuditLogEntry): string {
    return log.actor_name || log.actor_email || 'Unknown user';
}

function buildRequestHeadline(log: AuditLogEntry): string {
    const path = log.path ?? '';

    if (path === '/api/v1/notifications/send-reminders') return 'Sent weekly reminder emails';
    if (path === '/api/v1/invites' && log.method === 'POST') return 'Created a new invitation';
    if (/\/api\/v1\/invites\/[^/]+\/resend$/.test(path)) return 'Resent an invitation email';
    if (/\/api\/v1\/invites\/[^/]+$/.test(path) && log.method === 'DELETE') return 'Revoked an invitation';
    if (path === '/api/v1/settings' && (log.method === 'PUT' || log.method === 'PATCH')) return 'Updated system settings';
    if (path === '/api/v1/submissions' && log.method === 'POST') return 'Saved a weekly update';
    if (/\/api\/v1\/submissions\/[^/]+\/submit$/.test(path)) return 'Submitted a weekly update';
    if (/\/api\/v1\/submissions\/[^/]+\/review$/.test(path)) return 'Reviewed a weekly update';
    if (path === '/api/v1/projects' && log.method === 'POST') return 'Created a project';
    if (/\/api\/v1\/projects\/[^/]+$/.test(path) && log.method === 'PATCH') return 'Updated a project';
    if (/\/api\/v1\/projects\/[^/]+$/.test(path) && log.method === 'DELETE') return 'Deleted a project';
    if (/\/api\/v1\/projects\/[^/]+\/work-items$/.test(path) && log.method === 'POST') return 'Created a work item';
    if (/\/api\/v1\/projects\/[^/]+\/work-items\/[^/]+$/.test(path) && log.method === 'PATCH') return 'Updated a work item';
    if (/\/api\/v1\/projects\/[^/]+\/work-items\/[^/]+$/.test(path) && log.method === 'DELETE') return 'Deleted a work item';
    if (/\/api\/v1\/projects\/[^/]+\/join-requests$/.test(path) && log.method === 'POST') return 'Requested to join a project';
    if (/\/api\/v1\/projects\/[^/]+\/join-requests\/[^/]+$/.test(path) && log.method === 'PATCH') return 'Reviewed a project join request';
    if (/\/api\/v1\/users\/me\/set-name$/.test(path)) return 'Completed profile setup';
    if (/\/api\/v1\/users\/me$/.test(path) && log.method === 'PATCH') return 'Updated their profile';
    if (/\/api\/v1\/users\/[^/]+$/.test(path) && log.method === 'PATCH') return 'Updated a user account';
    if (/\/api\/v1\/comments\//.test(path) && log.method === 'POST') return 'Added a comment';
    if (/\/api\/v1\/comments\/[^/]+$/.test(path) && log.method === 'PATCH') return 'Edited a comment';
    if (/\/api\/v1\/comments\/[^/]+$/.test(path) && log.method === 'DELETE') return 'Deleted a comment';
    if (/\/api\/v1\/files\/upload/.test(path)) return 'Uploaded a file';
    if (/\/api\/v1\/files\/public\/upload/.test(path)) return 'Uploaded a public image';
    if (/\/api\/v1\/files\/[^/]+$/.test(path) && log.method === 'DELETE') return 'Deleted a file';

    return log.summary && !/^(POST|PATCH|PUT|DELETE)\s\//.test(log.summary)
        ? log.summary
        : `${titleCase((log.method || 'action').toLowerCase())} ${getAuditAreaLabel(getAuditArea(log)).toLowerCase()}`;
}

export function getAuditHeadline(log: AuditLogEntry): string {
    if (log.action === 'auth.google_login') return 'Signed in with Google';
    if (log.action === 'admin_access.grant_created' || log.action === 'admin_access.grant_updated') {
        const targetUser = readString(log.metadata.target_user_email);
        return targetUser ? `Granted delegated admin access to ${targetUser}` : 'Granted delegated admin access';
    }
    if (log.action === 'admin_access.grant_revoked') {
        const targetUser = readString(log.metadata.target_user_email);
        return targetUser ? `Revoked delegated admin access for ${targetUser}` : 'Revoked delegated admin access';
    }
    if (log.action.startsWith('http.')) return buildRequestHeadline(log);
    return log.summary || titleCase(log.action);
}

export function getAuditDescription(log: AuditLogEntry): string {
    const actor = getAuditActorLabel(log);
    const targetUser = readString(log.metadata.target_user_email);
    const scopes = Array.isArray(log.metadata.scopes) ? (log.metadata.scopes as string[]) : [];
    const requestedWeek = readRequestedWeek(log);

    if (log.action === 'auth.google_login') return `${actor} logged in to the portal.`;
    if (log.action === 'admin_access.grant_created' || log.action === 'admin_access.grant_updated') {
        const scopeList = scopes.length > 0 ? scopes.map(titleCase).join(', ') : 'selected admin scopes';
        return `${actor} gave ${targetUser || 'a teammate'} access to ${scopeList}.`;
    }
    if (log.action === 'admin_access.grant_revoked') return `${actor} removed delegated admin access${targetUser ? ` for ${targetUser}` : ''}.`;
    if ((log.path ?? '') === '/api/v1/notifications/send-reminders') {
        return requestedWeek ? `${actor} triggered reminder emails for ${requestedWeek}.` : `${actor} triggered the reminder email flow.`;
    }
    if (targetUser && /\/api\/v1\/users\/[^/]+$/.test(log.path ?? '')) return `${actor} changed account settings for ${targetUser}.`;
    if ((log.path ?? '').includes('/join-requests/') && log.method === 'PATCH') return `${actor} reviewed a project join request.`;
    if ((log.path ?? '').includes('/work-items')) return `${actor} changed project work tracking.`;
    if (log.summary && !/^(POST|PATCH|PUT|DELETE)\s\//.test(log.summary)) return log.summary;
    return `${actor} performed an action in ${getAuditAreaLabel(getAuditArea(log)).toLowerCase()}.`;
}

export function getAuditOutcomeLabel(log: AuditLogEntry): string {
    return log.success ? 'Success' : 'Failed';
}

export function getAuditActorKey(log: AuditLogEntry): string {
    return log.actor_user_id || log.actor_email || getAuditActorLabel(log);
}

export function getAuditSearchText(log: AuditLogEntry): string {
    return [
        getAuditHeadline(log),
        getAuditDescription(log),
        getAuditActorLabel(log),
        log.actor_email,
        log.actor_role,
        getAuditAreaLabel(getAuditArea(log)),
        log.summary,
        readString(log.metadata.target_user_email),
        readString(log.metadata.target_user_id),
        readString(log.metadata.note),
        readRequestedWeek(log),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

export function matchesAuditTimeFilter(log: AuditLogEntry, filter: AuditTimeFilter): boolean {
    if (filter === 'all') return true;
    const createdAt = parseISO(log.created_at);
    if (filter === '24h') return isAfter(createdAt, subDays(new Date(), 1));
    if (filter === '7d') return isAfter(createdAt, subDays(new Date(), 7));
    return isAfter(createdAt, subDays(new Date(), 30));
}

export function formatAuditAbsoluteTime(value: string): string {
    return format(parseISO(value), 'MMM d, yyyy h:mm a');
}

export function formatAuditRelativeTime(value: string): string {
    return formatDistanceToNowStrict(parseISO(value), { addSuffix: true });
}
