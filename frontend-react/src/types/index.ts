/**
 * Centralized TypeScript type definitions for Guardian's Embrace Portal
 */

// ============================================================================
// User Types
// ============================================================================

export type UserRole = 'volunteer' | 'team_lead' | 'admin';

export interface User {
    id: string;
    email: string;
    name: string;
    picture?: string;
    role: UserRole;
    team?: string;
    is_active: boolean;
    total_hours: number;
    total_submissions: number;
    created_at: string;
    last_login: string | null;
}

// ============================================================================
// Submission Types
// ============================================================================

export interface WorkEntry {
    description: string;
    hours: number;
    drive_link?: string;
    tags?: string[];
    work_item_id?: string;
    work_item_status_update?: 'pending' | 'active' | 'blocked' | 'finished';
}

export type SubmissionStatus = 'draft' | 'submitted' | 'reviewed';

export interface Submission {
    id: string;
    user_id: string;
    user_email: string;
    user_name: string;
    week_id: string;
    week_start: string;
    week_end: string;
    past_work: WorkEntry[];
    present_work: WorkEntry[];
    future_work: WorkEntry[];
    reported_hours: number;
    credited_hours: number;
    total_hours: number;
    blockers?: string;
    notes?: string;
    status: SubmissionStatus;
    reviewed_by?: string;
    reviewed_at?: string;
    admin_notes?: string;
    created_at: string;
    updated_at: string;
    submitted_at?: string;
}

export interface SubmissionSummary {
    id: string;
    user_id: string;
    user_name: string;
    week_id: string;
    reported_hours: number;
    credited_hours: number;
    total_hours: number;
    status: SubmissionStatus;
    submitted_at?: string;
    has_blockers: boolean;
}

// ============================================================================
// Comment Types
// ============================================================================

export interface Comment {
    id: string;
    submission_id: string;
    user_id: string;
    user_name: string;
    is_admin: boolean;
    content: string;
    parent_id?: string;
    is_edited: boolean;
    created_at: string;
    updated_at: string;
    replies: Comment[];
}

// ============================================================================
// Week & Schedule Types
// ============================================================================

export interface WeekInfo {
    week_id: string;
    week_start: string;
    week_end: string;
    is_submission_window_open: boolean;
    has_submission: boolean;
    submission_status?: string;
    submission_id?: string;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthResponse {
    access_token: string;
    token_type: string;
    user: User;
}

// ============================================================================
// File Upload Types
// ============================================================================

export interface UploadedFile {
    file_id: string;
    filename: string;
    mime_type: string;
    drive_link: string;
    uploaded_at: string;
    storage_type?: 'shared_drive' | 's3' | 'local';
    project_file_id?: string;
    project_id?: string;
    project_name?: string;
    submission_id?: string;
    work_item_id?: string;
    source_type?: 'submission' | 'project' | 'work_item';
    uploaded_by_name?: string;
    week_id?: string;
    size_bytes?: number;
}

export interface DriveStatus {
    configured: boolean;
    message: string;
    storage_type?: 'shared_drive' | 's3' | 'local';
}

// ============================================================================
// API Response Types
// ============================================================================

export interface UserStats {
    total_users: number;
    active_users: number;
    inactive_users: number;
    volunteers: number;
    admins: number;
}

export interface SubmissionStats {
    week_id: string;
    this_week: {
        total_drafts: number;
        total_submitted: number;
        total_hours: number;
        blockers_count: number;
    };
    all_time: {
        total_submissions: number;
    };
}

// ============================================================================
// Form Types
// ============================================================================

export interface FormEntry {
    id: string;
    description: string;
    hours: number;
    drive_link: string;
}

export interface SubmissionFormData {
    past_work: WorkEntry[];
    present_work: WorkEntry[];
    future_work: WorkEntry[];
    blockers?: string;
    notes?: string;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType =
    | 'submission_reviewed'
    | 'admin_comment'
    | 'join_request_reviewed'
    | 'join_request_received'
    | 'project_activity';

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
    read: boolean;
    created_at: string;
}

export interface NotificationListResponse {
    notifications: Notification[];
    unread_count: number;
}

export interface NotificationPreferences {
    notif_submission_reviewed: boolean;
    notif_admin_comment: boolean;
    notif_join_request_reviewed: boolean;
    notif_join_request_received: boolean;
    notif_project_activity: boolean;
}

// ============================================================================
// Route Constants
// ============================================================================

export const ROUTES = {
    LOGIN: '/login',
    DASHBOARD: '/dashboard',
    SUBMISSIONS: '/submissions',
    NEW_SUBMISSION: '/submissions/new',
    ADMIN_USERS: '/admin/users',
    ADMIN_SUBMISSIONS: '/admin/submissions',
} as const;

// ============================================================================
// Status Constants
// ============================================================================

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
};

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
    draft: 'var(--color-warning)',
    submitted: 'var(--color-primary-gold)',
    reviewed: 'var(--color-success)',
};
