import { describe, expect, it } from 'vitest';
import type { AuditLogEntry } from './api';
import {
    getAuditArea,
    getAuditDescription,
    getAuditHeadline,
    getAuditSearchText,
} from './auditTrail';

function makeLog(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
    return {
        id: 'log-1',
        event_type: 'request',
        actor_user_id: 'user-1',
        actor_email: 'ujwal@example.com',
        actor_name: 'Ujwal V',
        actor_role: 'admin',
        is_admin: true,
        is_delegated: false,
        action: 'http.post',
        resource_type: 'system',
        summary: 'POST /api/v1/example',
        method: 'POST',
        path: '/api/v1/example',
        success: true,
        metadata: {},
        created_at: '2026-03-27T18:00:00Z',
        ...overrides,
    };
}

describe('auditTrail helpers', () => {
    it('humanizes reminder actions', () => {
        const log = makeLog({
            path: '/api/v1/notifications/send-reminders',
            summary: 'POST /api/v1/notifications/send-reminders',
            metadata: { query: { week_id: '2026-W13' } },
        });

        expect(getAuditArea(log)).toBe('notifications');
        expect(getAuditHeadline(log)).toBe('Sent weekly reminder emails');
        expect(getAuditDescription(log)).toBe('Ujwal V triggered reminder emails for 2026-W13.');
    });

    it('humanizes delegated admin grant events', () => {
        const log = makeLog({
            event_type: 'admin_access',
            action: 'admin_access.grant_created',
            resource_type: 'admin_access_grant',
            summary: 'Granted delegated admin access',
            metadata: {
                target_user_email: 'helper@guardiansembrace.org',
                scopes: ['view_users', 'view_audit_logs'],
            },
        });

        expect(getAuditArea(log)).toBe('admin_access');
        expect(getAuditHeadline(log)).toBe('Granted delegated admin access to helper@guardiansembrace.org');
        expect(getAuditDescription(log)).toBe('Ujwal V gave helper@guardiansembrace.org access to View Users, View Audit Logs.');
        expect(getAuditSearchText(log)).toContain('helper@guardiansembrace.org');
    });
});
