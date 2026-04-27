/**
 * API Client for Guardians Portal
 */

import { API_URL } from './config';

// Types
export interface User {
    id: string;
    email: string;
    name: string;
    picture?: string;
    role: 'volunteer' | 'team_lead' | 'admin';
    team?: string;
    is_active: boolean;
    invited_only?: boolean;
    total_hours: number;
    total_submissions: number;
    submission_streak: number;
    created_at: string;
    last_login: string | null;
    profile_complete: boolean;
    file_access_expires?: string;
    admin_access: AdminAccessSummary;
}

export type AdminAccessScope =
    | 'view_users'
    | 'edit_users'
    | 'manage_user_status'
    | 'manage_user_roles'
    | 'manage_users'
    | 'review_submissions'
    | 'send_reminders'
    | 'manage_invites'
    | 'manage_projects'
    | 'manage_settings'
    | 'view_audit_logs'
    | 'view_admin_access'
    | 'manage_admin_access';

export interface AdminAccessSummary {
    can_access_portal: boolean;
    is_delegated: boolean;
    scopes: AdminAccessScope[];
    grant_id?: string;
    granted_by_email?: string;
    expires_at?: string;
}

export interface AdminAccessGrant {
    id: string;
    user_id: string;
    user_email: string;
    user_name: string;
    granted_by_user_id: string;
    granted_by_email: string;
    granted_by_name: string;
    scopes: AdminAccessScope[];
    note?: string;
    expires_at?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    revoked_at?: string;
    revoked_by_user_id?: string;
    revoked_by_email?: string;
}

export interface AdminAccessGrantCreate {
    user_id: string;
    scopes: AdminAccessScope[];
    note?: string | null;
    expires_at?: string | null;
}

export interface AuditLogEntry {
    id: string;
    event_type: 'request' | 'security' | 'admin_access';
    actor_user_id?: string;
    actor_email?: string;
    actor_name?: string;
    actor_role?: string;
    is_admin: boolean;
    is_delegated: boolean;
    delegated_grant_id?: string;
    delegated_by_user_id?: string;
    delegated_by_email?: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    summary: string;
    method?: string;
    path?: string;
    status_code?: number;
    success: boolean;
    request_id?: string;
    ip_address?: string;
    user_agent?: string;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface WorkEntry {
    description: string;
    hours: number;
    drive_link?: string;
    tags?: string[];
    work_item_id?: string;
    work_item_status_update?: 'pending' | 'active' | 'blocked' | 'finished';
}

export interface Submission {
    id: string;
    user_id: string;
    user_email: string;
    user_name: string;
    project_id: string;
    project_name?: string;
    visibility?: string;
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
    mood_rating?: number;
    custom_responses?: Record<string, WorkEntry[]>;
    is_late?: boolean;
    status: 'draft' | 'submitted' | 'reviewed';
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
    project_id: string;
    project_name?: string;
    week_id: string;
    reported_hours: number;
    credited_hours: number;
    total_hours: number;
    status: 'draft' | 'submitted' | 'reviewed';
    submitted_at?: string;
    has_blockers: boolean;
    is_late?: boolean;
}

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

export interface WeekInfo {
    week_id: string;
    week_start: string;
    week_end: string;
    submission_window_start: string;
    submission_deadline: string;
    is_submission_window_open: boolean;
    allow_late_submissions: boolean;
    has_submission: boolean;
    submission_status?: string;
    submission_id?: string;
}

export interface SelectableSubmissionWeek {
    week_id: string;
    week_start: string;
    week_end: string;
    is_current: boolean;
    has_submission: boolean;
    submission_id?: string;
    submission_status?: 'draft' | 'submitted' | 'reviewed';
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
    user: User;
}

export interface HoursTrendPoint {
    week_id: string;
    total_hours: number;
    submitted: boolean;
}

export interface AttendanceCell {
    week_id: string;
    status: 'none' | 'draft' | 'submitted' | 'reviewed';
    total_hours: number;
    is_current: boolean;
}

export interface AttendanceData {
    grid: AttendanceCell[];
    total_weeks: number;
    submitted_weeks: number;
    attendance_rate: number;
}

export interface ReminderResult {
    success: boolean;
    total_volunteers: number;
    already_submitted: number;
    reminders_sent: number;
    errors: { email: string; error: string }[];
    message: string;
}

export interface UploadedFile {
    file_id: string;
    filename: string;
    mime_type: string;
    drive_link: string;
    uploaded_at: string;
    storage_type?: string;
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

export interface PresignedUploadResponse extends UploadedFile {
    upload_url: string;
    method: string;
    headers?: Record<string, string>;
}

export interface FileUploadContext {
    week_id?: string;
    project_id?: string;
    submission_id?: string;
    work_item_id?: string;
    source_type?: 'submission' | 'project' | 'work_item';
}

export interface FileInfo {
    id: string;
    name: string;
    mime_type?: string;
    web_link?: string;
    size?: string;
    created_time?: string;
}

export interface FormSection {
    id: string;
    title: string;
    subtitle?: string;
    icon?: string;
    type: string;
    showHours: boolean;
    required: boolean;
    fields?: Array<Record<string, unknown>>;
}

export interface WeeklyUpdateSettings {
    window_mode: 'always_open' | 'scheduled';
    submissions_open_day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    submissions_open_hour: number;
    submissions_open_minute: number;
    deadline_day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    deadline_hour: number;
    deadline_minute: number;
    allow_late_submissions: boolean;
    timezone: string;
}

export interface AdminSettings {
    settings_id: string;
    tags: string[];
    active_projects: string[];
    form_sections: FormSection[];
    weekly_updates: WeeklyUpdateSettings;
}

const DEFAULT_WEEKLY_UPDATE_SETTINGS: WeeklyUpdateSettings = {
    window_mode: 'always_open',
    submissions_open_day: 'friday',
    submissions_open_hour: 0,
    submissions_open_minute: 0,
    deadline_day: 'sunday',
    deadline_hour: 23,
    deadline_minute: 59,
    allow_late_submissions: true,
    timezone: 'America/New_York',
};

interface CacheEntry {
    expiresAt: number;
    value: unknown;
}

const SHORT_LIVED_CACHE_TTL_MS = 5_000;
const DEFAULT_GET_CACHE_TTL_MS = 15_000;
const LONG_LIVED_CACHE_TTL_MS = 5 * 60_000;

function normalizeWeekInfo(data: WeekInfo): WeekInfo {
    return {
        ...data,
        submission_window_start: data.submission_window_start ?? data.week_start,
        submission_deadline: data.submission_deadline ?? data.week_end,
        is_submission_window_open: data.is_submission_window_open ?? true,
        allow_late_submissions: data.allow_late_submissions ?? true,
    };
}

function normalizeAdminSettings(data: AdminSettings): AdminSettings {
    return {
        ...data,
        tags: data.tags ?? [],
        active_projects: data.active_projects ?? [],
        form_sections: data.form_sections ?? [],
        weekly_updates: {
            ...DEFAULT_WEEKLY_UPDATE_SETTINGS,
            ...(data.weekly_updates ?? {}),
        },
    };
}

export interface ProjectUserSummary {
    id: string;
    email: string;
    name: string;
    picture?: string;
    role: 'volunteer' | 'team_lead' | 'admin';
    team?: string;
    invited_only?: boolean;
}

export interface Project {
    id: string;
    name: string;
    description: string;
    status: 'active' | 'completed' | 'on_hold' | 'planned';
    tags?: string[];
    banner_image?: string;
    lead?: ProjectUserSummary;
    members: ProjectUserSummary[];
    created_at: string;
    updated_at: string;
}

export interface ProjectCreate {
    name: string;
    description: string;
    status?: 'active' | 'completed' | 'on_hold' | 'planned';
    tags?: string[];
    banner_image?: string;
    lead_id?: string;
    member_ids?: string[];
}

export interface ProjectWorkItem {
    id: string;
    project_id: string;
    title: string;
    description?: string;
    item_type: string;
    status: 'pending' | 'active' | 'blocked' | 'finished';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    assignee_id?: string;
    assignee_name?: string;
    assignee_ids?: string[];
    assignee_names?: string[];
    created_by_id: string;
    created_by_name: string;
    updated_by_id: string;
    updated_by_name: string;
    due_date?: string;
    created_at: string;
    updated_at: string;
}

export interface ProjectWorkItemCreate {
    title: string;
    description?: string | null;
    item_type: string;
    status?: 'pending' | 'active' | 'blocked' | 'finished';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    assignee_id?: string | null;
    assignee_ids?: string[] | null;
    due_date?: string | null;
}

export interface ProjectJoinRequest {
    id: string;
    project_id: string;
    user_id: string;
    user_email: string;
    user_name: string;
    request_type: 'access' | 'lead' | 'delete';
    message?: string;
    status: 'pending' | 'approved' | 'declined';
    requested_at: string;
    reviewed_at?: string;
    reviewed_by_id?: string;
    reviewed_by_name?: string;
}

export interface ProjectJoinRequestCreate {
    request_type?: 'access' | 'lead' | 'delete';
    message?: string | null;
}

export interface AllowedEmail {
    id?: string;
    email: string;
    role: 'volunteer' | 'team_lead' | 'admin';
    invited_by?: string;
    created_at: string;
    portal_status?: 'pending_login' | 'access_record';
    has_logged_in?: boolean;
    user_name?: string;
    user_last_login?: string | null;
}

export interface InviteCreate {
    email: string;
    role: 'volunteer' | 'team_lead' | 'admin';
}


export class ApiClient {
    private token: string | null = null;
    private readonly onUnauthorized: (path: string) => void;
    private readonly responseCache = new Map<string, CacheEntry>();
    private readonly inFlightRequests = new Map<string, Promise<unknown>>();
    private cacheRevision = 0;

    constructor(onUnauthorized: (path: string) => void = (path) => window.location.assign(path)) {
        this.onUnauthorized = onUnauthorized;
    }

    setToken(token: string) {
        if (this.token !== token) {
            this.resetCaches();
        }
        this.token = token;
        localStorage.setItem('auth_token', token);
    }

    getToken(): string | null {
        if (this.token) return this.token;
        this.token = localStorage.getItem('auth_token');
        return this.token;
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('auth_token');
        this.resetCaches();
    }

    private redirectToLogin() {
        this.onUnauthorized('/login');
    }

    private resetCaches() {
        this.responseCache.clear();
        this.inFlightRequests.clear();
        this.cacheRevision += 1;
    }

    private getCacheKey(endpoint: string, method = 'GET') {
        return `${method.toUpperCase()} ${endpoint}`;
    }

    private invalidateCacheByPrefix(...prefixes: string[]) {
        if (prefixes.length === 0) {
            return;
        }

        const cachePrefixes = prefixes.map((prefix) => this.getCacheKey(prefix));

        for (const key of Array.from(this.responseCache.keys())) {
            if (cachePrefixes.some((prefix) => key.startsWith(prefix))) {
                this.responseCache.delete(key);
            }
        }

        for (const key of Array.from(this.inFlightRequests.keys())) {
            if (cachePrefixes.some((prefix) => key.startsWith(prefix))) {
                this.inFlightRequests.delete(key);
            }
        }

        this.cacheRevision += 1;
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const token = this.getToken();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            if (response.status === 401) {
                this.clearToken();
                this.redirectToLogin();
            }
            const error = await response.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(error.detail || 'Request failed');
        }

        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    }

    private async cachedGet<T>(endpoint: string, cacheTtlMs = DEFAULT_GET_CACHE_TTL_MS): Promise<T> {
        const cacheKey = this.getCacheKey(endpoint);
        const now = Date.now();
        const cached = this.responseCache.get(cacheKey);

        if (cached && cached.expiresAt > now) {
            return cached.value as T;
        }

        const inFlight = this.inFlightRequests.get(cacheKey);
        if (inFlight) {
            return inFlight as Promise<T>;
        }

        const revisionAtStart = this.cacheRevision;
        const requestPromise = this.request<T>(endpoint)
            .then((data) => {
                if (cacheTtlMs > 0 && revisionAtStart === this.cacheRevision) {
                    this.responseCache.set(cacheKey, {
                        value: data,
                        expiresAt: Date.now() + cacheTtlMs,
                    });
                }
                return data;
            })
            .finally(() => {
                this.inFlightRequests.delete(cacheKey);
            });

        this.inFlightRequests.set(cacheKey, requestPromise);
        return requestPromise;
    }

    // Auth
    async loginWithGoogle(accessToken: string): Promise<AuthResponse> {
        const response = await this.request<AuthResponse>('/auth/google', {
            method: 'POST',
            body: JSON.stringify({ access_token: accessToken }),
        });
        this.setToken(response.access_token);
        return response;
    }

    logout() {
        this.clearToken();
    }

    // Users
    async getCurrentUser(): Promise<User> {
        return this.cachedGet<User>('/users/me', DEFAULT_GET_CACHE_TTL_MS);
    }

    async setName(fullName: string): Promise<User> {
        const response = await this.request<User>('/users/me/set-name', {
            method: 'POST',
            body: JSON.stringify({ full_name: fullName }),
        });
        this.invalidateCacheByPrefix('/users');
        return response;
    }

    async getAllUsers(params?: Record<string, string | number | boolean | undefined>): Promise<User[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) queryParams.append(key, String(value));
            });
        }
        return this.cachedGet<User[]>(`/users?${queryParams}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async getUserStats() {
        return this.cachedGet<{
            total_users: number;
            active_users: number;
            inactive_users: number;
            volunteers: number;
            team_leads: number;
            admins: number;
        }>('/users/stats/overview', DEFAULT_GET_CACHE_TTL_MS);
    }

    async updateUser(userId: string, data: {
        name?: string;
        team?: string;
        role?: 'volunteer' | 'team_lead' | 'admin';
        is_active?: boolean;
    }): Promise<User> {
        const response = await this.request<User>(`/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/users', '/projects');
        return response;
    }

    // Invites
    async getInvites(): Promise<AllowedEmail[]> {
        return this.cachedGet<AllowedEmail[]>('/invites', DEFAULT_GET_CACHE_TTL_MS);
    }

    async inviteUser(data: InviteCreate): Promise<AllowedEmail> {
        const response = await this.request<AllowedEmail>('/invites', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/invites', '/users');
        return response;
    }

    async revokeInvite(email: string): Promise<void> {
        const response = await this.request<void>(`/invites/${email}`, {
            method: 'DELETE',
        });
        this.invalidateCacheByPrefix('/invites', '/users');
        return response;
    }

    async resendInvite(email: string): Promise<void> {
        const response = await this.request<void>(`/invites/${email}/resend`, {
            method: 'POST',
        });
        this.invalidateCacheByPrefix('/invites');
        return response;
    }

    // Submissions
    async getCurrentWeekInfo(weekId?: string, projectId?: string): Promise<WeekInfo> {
        const queryParams = new URLSearchParams();
        if (weekId) queryParams.append('week_id', weekId);
        if (projectId) queryParams.append('project_id', projectId);
        const data = await this.cachedGet<WeekInfo>(`/submissions/current-week${queryParams.toString() ? `?${queryParams.toString()}` : ''}`, DEFAULT_GET_CACHE_TTL_MS);
        return normalizeWeekInfo(data);
    }

    async getSelectableSubmissionWeeks(includeWeekId?: string, projectId?: string): Promise<SelectableSubmissionWeek[]> {
        const queryParams = new URLSearchParams();
        if (includeWeekId) queryParams.append('include_week_id', includeWeekId);
        if (projectId) queryParams.append('project_id', projectId);
        const response = await this.cachedGet<{
            current_week_id: string;
            max_backfill_weeks: number;
            weeks: SelectableSubmissionWeek[];
        }>(`/submissions/selectable-weeks${queryParams.toString() ? `?${queryParams.toString()}` : ''}`, DEFAULT_GET_CACHE_TTL_MS);
        return response.weeks;
    }

    async getWorkCategories(): Promise<string[]> {
        const res = await this.cachedGet<{ categories: string[] }>('/submissions/categories', LONG_LIVED_CACHE_TTL_MS);
        return res.categories;
    }

    async getLastWeekGoals(weekId?: string, projectId?: string): Promise<{ goals: WorkEntry[]; from_week: string }> {
        const queryParams = new URLSearchParams();
        if (weekId) queryParams.append('week_id', weekId);
        if (projectId) queryParams.append('project_id', projectId);
        return this.cachedGet<{ goals: WorkEntry[]; from_week: string }>(`/submissions/last-week-goals${queryParams.toString() ? `?${queryParams.toString()}` : ''}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async getHoursTrend(weeks = 8): Promise<HoursTrendPoint[]> {
        const res = await this.cachedGet<{ trend: HoursTrendPoint[] }>(`/submissions/hours-trend?weeks=${weeks}`, DEFAULT_GET_CACHE_TTL_MS);
        return res.trend;
    }

    async getAttendance(weeks = 12): Promise<AttendanceData> {
        return this.cachedGet<AttendanceData>(`/submissions/attendance?weeks=${weeks}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async getMySubmissions(): Promise<SubmissionSummary[]> {
        return this.cachedGet<SubmissionSummary[]>('/submissions/my', DEFAULT_GET_CACHE_TTL_MS);
    }

    async getSubmission(submissionId: string): Promise<Submission> {
        return this.cachedGet<Submission>(`/submissions/${submissionId}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async getProjectSubmissions(projectId: string): Promise<SubmissionSummary[]> {
        return this.cachedGet<SubmissionSummary[]>(`/projects/${projectId}/submissions`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async getProjectSubmission(projectId: string, submissionId: string): Promise<Submission> {
        return this.cachedGet<Submission>(`/projects/${projectId}/submissions/${submissionId}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async getAllSubmissions(params?: Record<string, string | number | boolean | undefined>): Promise<SubmissionSummary[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) queryParams.append(key, String(value));
            });
        }
        return this.cachedGet<SubmissionSummary[]>(`/submissions?${queryParams}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async createOrUpdateSubmission(data: {
        project_id: string;
        week_id?: string;
        past_work: WorkEntry[];
        present_work: WorkEntry[];
        future_work: WorkEntry[];
        blockers?: string;
        notes?: string;
        mood_rating?: number;
    }): Promise<Submission> {
        const response = await this.request<Submission>('/submissions', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/submissions', '/users/me', '/submissions/selectable-weeks', `/projects/${data.project_id}/submissions`);
        return response;
    }

    async submitSubmission(submissionId: string): Promise<Submission> {
        const response = await this.request<Submission>(`/submissions/${submissionId}/submit`, {
            method: 'POST',
        });
        this.invalidateCacheByPrefix('/submissions', '/users/me', '/submissions/selectable-weeks');
        return response;
    }

    async reviewSubmission(submissionId: string, adminNotes?: string): Promise<Submission> {
        const response = await this.request<Submission>(`/submissions/${submissionId}/review`, {
            method: 'POST',
            body: JSON.stringify({ admin_notes: adminNotes }),
        });
        this.invalidateCacheByPrefix('/submissions');
        return response;
    }

    async deleteSubmission(submissionId: string): Promise<void> {
        await this.request<void>(`/submissions/${submissionId}`, { method: 'DELETE' });
        this.invalidateCacheByPrefix('/submissions', '/users/me');
    }

    async getSubmissionStats(weekId?: string) {
        const queryParams = weekId ? `?week_id=${weekId}` : '';
        return this.cachedGet<{
            week_id: string;
            this_week: {
                total_drafts: number;
                total_submitted: number;
                total_hours: number;
                blockers_count: number;
            };
            all_time: { total_submissions: number };
        }>(`/submissions/stats/overview${queryParams}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    // Comments
    async getComments(submissionId: string): Promise<Comment[]> {
        return this.cachedGet<Comment[]>(`/comments/submission/${submissionId}`, SHORT_LIVED_CACHE_TTL_MS);
    }

    async createComment(submissionId: string, content: string, parentId?: string): Promise<Comment> {
        const response = await this.request<Comment>(`/comments/submission/${submissionId}`, {
            method: 'POST',
            body: JSON.stringify({ content, parent_id: parentId }),
        });
        this.invalidateCacheByPrefix(`/comments/submission/${submissionId}`);
        return response;
    }

    // Files / Google Drive
    async getDriveStatus(): Promise<{ configured: boolean; message: string; storage_type: 'shared_drive' | 's3' | 'local'; folder_name?: string }> {
        return this.cachedGet<{ configured: boolean; message: string; storage_type: 'shared_drive' | 's3' | 'local'; folder_name?: string }>('/files/drive-status', LONG_LIVED_CACHE_TTL_MS);
    }

    async uploadFile(file: File, context?: FileUploadContext): Promise<UploadedFile> {
        const token = this.getToken();
        const status = await this.getDriveStatus();

        if (status.storage_type === 's3') {
            const uploadPlanResponse = await fetch(`${API_URL}/files/upload-url`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: file.name,
                    content_type: file.type || 'application/octet-stream',
                    size: file.size,
                    week_id: context?.week_id,
                    project_id: context?.project_id,
                    submission_id: context?.submission_id,
                    work_item_id: context?.work_item_id,
                    source_type: context?.source_type,
                }),
            });

            if (!uploadPlanResponse.ok) {
                const error = await uploadPlanResponse.json().catch(() => ({ detail: 'Upload failed' }));
                throw new Error(error.detail || 'Upload failed');
            }

            const uploadPlan = await uploadPlanResponse.json() as PresignedUploadResponse;
            const uploadResponse = await fetch(uploadPlan.upload_url, {
                method: uploadPlan.method || 'PUT',
                headers: uploadPlan.headers ?? { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
            });

            if (!uploadResponse.ok) {
                throw new Error('Direct upload to S3 failed');
            }

            const finalized = await this.request<UploadedFile>('/files/upload-complete', {
                method: 'POST',
                body: JSON.stringify({
                    file_id: uploadPlan.file_id,
                    filename: uploadPlan.filename,
                    mime_type: uploadPlan.mime_type,
                    uploaded_at: uploadPlan.uploaded_at,
                    storage_type: uploadPlan.storage_type,
                    size: file.size,
                    week_id: context?.week_id,
                    project_id: context?.project_id,
                    submission_id: context?.submission_id,
                    work_item_id: context?.work_item_id,
                    source_type: context?.source_type,
                }),
            });

            this.invalidateCacheByPrefix('/files');
            if (context?.project_id) {
                this.invalidateCacheByPrefix(`/projects/${context.project_id}/files`);
            }
            if (context?.submission_id) {
                this.invalidateCacheByPrefix(`/submissions/${context.submission_id}/files`);
            }
            return finalized;
        }

        const formData = new FormData();
        formData.append('file', file);
        if (context?.week_id) formData.append('week_id', context.week_id);
        if (context?.project_id) formData.append('project_id', context.project_id);
        if (context?.submission_id) formData.append('submission_id', context.submission_id);
        if (context?.work_item_id) formData.append('work_item_id', context.work_item_id);
        if (context?.source_type) formData.append('source_type', context.source_type);

        const response = await fetch(`${API_URL}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
            throw new Error(error.detail || 'Upload failed');
        }

        const result = await response.json();
        this.invalidateCacheByPrefix('/files');
        if (context?.project_id) {
            this.invalidateCacheByPrefix(`/projects/${context.project_id}/files`);
        }
        if (context?.submission_id) {
            this.invalidateCacheByPrefix(`/submissions/${context.submission_id}/files`);
        }
        return result;
    }

    async uploadMultipleFiles(files: File[], context?: FileUploadContext): Promise<UploadedFile[]> {
        const uploads: UploadedFile[] = [];
        for (const file of files) {
            uploads.push(await this.uploadFile(file, context));
        }
        return uploads;
    }

    async getFolderLink(weekId?: string): Promise<{ folder_link: string | null; week_id?: string }> {
        const queryParams = weekId ? `?week_id=${weekId}` : '';
        return this.cachedGet<{ folder_link: string | null; week_id?: string }>(`/files/folder-link${queryParams}`, SHORT_LIVED_CACHE_TTL_MS);
    }

    async uploadProjectImage(file: File): Promise<{ url: string; filename: string }> {
        const token = this.getToken();
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_URL}/files/public/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
            throw new Error(error.detail || 'Upload failed');
        }

        return response.json();
    }

    async getFileDownloadLink(fileId: string): Promise<{ url: string }> {
        return this.request<{ url: string }>(`/files/download-link/${encodeURIComponent(fileId)}`);
    }

    // File listing
    async listFiles(params?: { week_id?: string; volunteer_name?: string }): Promise<FileInfo[]> {
        const queryParams = new URLSearchParams();
        if (params?.week_id) queryParams.append('week_id', params.week_id);
        if (params?.volunteer_name) queryParams.append('volunteer_name', params.volunteer_name);
        const qs = queryParams.toString();
        return this.cachedGet<FileInfo[]>(`/files/list${qs ? `?${qs}` : ''}`, SHORT_LIVED_CACHE_TTL_MS);
    }

    async listSubmissionFiles(submissionId: string): Promise<UploadedFile[]> {
        return this.cachedGet<UploadedFile[]>(`/submissions/${submissionId}/files`, SHORT_LIVED_CACHE_TTL_MS);
    }

    async listProjectFiles(projectId: string): Promise<UploadedFile[]> {
        return this.cachedGet<UploadedFile[]>(`/projects/${projectId}/files`, SHORT_LIVED_CACHE_TTL_MS);
    }

    // File download (returns blob URL for browser download)
    async downloadFile(fileId: string): Promise<Blob> {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/files/download/${fileId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Download failed' }));
            throw new Error(error.detail || 'Download failed');
        }

        return response.blob();
    }

    // File deletion
    async deleteFile(fileId: string): Promise<{ success: boolean; message: string }> {
        const response = await this.request<{ success: boolean; message: string }>(`/files/${fileId}`, {
            method: 'DELETE',
        });
        this.invalidateCacheByPrefix('/files');
        return response;
    }

    // Notifications
    async getEmailStatus(): Promise<{ configured: boolean; message: string }> {
        return this.cachedGet<{ configured: boolean; message: string }>('/notifications/email-status', LONG_LIVED_CACHE_TTL_MS);
    }

    async sendReminders(weekId?: string): Promise<ReminderResult> {
        const qs = weekId ? `?week_id=${weekId}` : '';
        const response = await this.request<ReminderResult>(`/notifications/send-reminders${qs}`, {
            method: 'POST',
        });
        this.invalidateCacheByPrefix('/notifications', '/submissions');
        return response;
    }

    // Projects
    async getProjects(status?: string): Promise<Project[]> {
        const qs = status ? `?status=${status}` : '';
        return this.cachedGet<Project[]>(`/projects${qs}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async getProject(projectId: string): Promise<Project> {
        return this.cachedGet<Project>(`/projects/${projectId}`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async createProject(data: ProjectCreate): Promise<Project> {
        const response = await this.request<Project>('/projects', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async updateProject(projectId: string, data: Partial<ProjectCreate>): Promise<Project> {
        const response = await this.request<Project>(`/projects/${projectId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async addProjectMember(projectId: string, userId: string): Promise<Project> {
        const response = await this.request<Project>(`/projects/${projectId}/members/${userId}`, {
            method: 'POST',
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async removeProjectMember(projectId: string, userId: string): Promise<Project> {
        const response = await this.request<Project>(`/projects/${projectId}/members/${userId}`, {
            method: 'DELETE',
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async deleteProject(projectId: string): Promise<void> {
        const response = await this.request<void>(`/projects/${projectId}`, {
            method: 'DELETE',
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async getProjectWorkItems(projectId: string): Promise<ProjectWorkItem[]> {
        return this.cachedGet<ProjectWorkItem[]>(`/projects/${projectId}/work-items`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async getMyAssignedWorkItems(projectId: string): Promise<ProjectWorkItem[]> {
        return this.cachedGet<ProjectWorkItem[]>(`/projects/${projectId}/work-items/my-assigned`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async createProjectWorkItem(projectId: string, data: ProjectWorkItemCreate): Promise<ProjectWorkItem> {
        const response = await this.request<ProjectWorkItem>(`/projects/${projectId}/work-items`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async updateProjectWorkItem(projectId: string, workItemId: string, data: Partial<ProjectWorkItemCreate>): Promise<ProjectWorkItem> {
        const response = await this.request<ProjectWorkItem>(`/projects/${projectId}/work-items/${workItemId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async deleteProjectWorkItem(projectId: string, workItemId: string): Promise<void> {
        const response = await this.request<void>(`/projects/${projectId}/work-items/${workItemId}`, {
            method: 'DELETE',
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async getProjectJoinRequests(projectId: string): Promise<ProjectJoinRequest[]> {
        return this.cachedGet<ProjectJoinRequest[]>(`/projects/${projectId}/join-requests`, DEFAULT_GET_CACHE_TTL_MS);
    }

    async requestProjectAccess(projectId: string, data: ProjectJoinRequestCreate): Promise<ProjectJoinRequest> {
        const response = await this.request<ProjectJoinRequest>(`/projects/${projectId}/join-requests`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    async reviewProjectJoinRequest(
        projectId: string,
        joinRequestId: string,
        status: 'approved' | 'declined'
    ): Promise<ProjectJoinRequest> {
        const response = await this.request<ProjectJoinRequest>(`/projects/${projectId}/join-requests/${joinRequestId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
        this.invalidateCacheByPrefix('/projects');
        return response;
    }

    // Settings
    async getSettings(): Promise<AdminSettings> {
        const data = await this.cachedGet<AdminSettings>('/settings', LONG_LIVED_CACHE_TTL_MS);
        return normalizeAdminSettings(data);
    }

    async updateSettings(data: AdminSettings): Promise<{ success: boolean; settings: AdminSettings }> {
        const response = await this.request<{ success: boolean; settings: AdminSettings }>('/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/settings', '/submissions/current-week', '/submissions/selectable-weeks');
        return {
            ...response,
            settings: normalizeAdminSettings(response.settings),
        };
    }

    // Delegated admin access
    async getAdminAccessGrants(): Promise<AdminAccessGrant[]> {
        return this.cachedGet<AdminAccessGrant[]>('/admin-access/grants', DEFAULT_GET_CACHE_TTL_MS);
    }

    async createAdminAccessGrant(data: AdminAccessGrantCreate): Promise<AdminAccessGrant> {
        const response = await this.request<AdminAccessGrant>('/admin-access/grants', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this.invalidateCacheByPrefix('/admin-access', '/users');
        return response;
    }

    async revokeAdminAccessGrant(grantId: string): Promise<void> {
        const response = await this.request<void>(`/admin-access/grants/${grantId}`, {
            method: 'DELETE',
        });
        this.invalidateCacheByPrefix('/admin-access', '/users');
        return response;
    }

    async getAuditLogs(params?: {
        limit?: number;
        actor_user_id?: string;
        resource_type?: string;
        event_type?: AuditLogEntry['event_type'];
        success?: boolean;
        action?: string;
        is_delegated?: boolean;
    }): Promise<AuditLogEntry[]> {
        const queryParams = new URLSearchParams();
        if (params?.limit !== undefined) queryParams.append('limit', String(params.limit));
        if (params?.actor_user_id) queryParams.append('actor_user_id', params.actor_user_id);
        if (params?.resource_type) queryParams.append('resource_type', params.resource_type);
        if (params?.event_type) queryParams.append('event_type', params.event_type);
        if (params?.success !== undefined) queryParams.append('success', String(params.success));
        if (params?.action) queryParams.append('action', params.action);
        if (params?.is_delegated !== undefined) queryParams.append('is_delegated', String(params.is_delegated));
        const qs = queryParams.toString();
        return this.cachedGet<AuditLogEntry[]>(`/admin-access/audit-logs${qs ? `?${qs}` : ''}`, SHORT_LIVED_CACHE_TTL_MS);
    }

}

export const api = new ApiClient();
