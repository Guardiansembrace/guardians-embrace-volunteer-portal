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
}

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
    week_id: string;
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
}

export interface PresignedUploadResponse extends UploadedFile {
    upload_url: string;
    method: string;
    headers?: Record<string, string>;
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
    due_date?: string | null;
}

export interface ProjectJoinRequest {
    id: string;
    project_id: string;
    user_id: string;
    user_email: string;
    user_name: string;
    message?: string;
    status: 'pending' | 'approved' | 'declined';
    requested_at: string;
    reviewed_at?: string;
    reviewed_by_id?: string;
    reviewed_by_name?: string;
}

export interface ProjectJoinRequestCreate {
    message?: string | null;
}

export interface AllowedEmail {
    id: string;
    email: string;
    role: 'volunteer' | 'team_lead' | 'admin';
    invited_by?: string;
    created_at: string;
}

export interface InviteCreate {
    email: string;
    role: 'volunteer' | 'team_lead' | 'admin';
}


export class ApiClient {
    private token: string | null = null;
    private readonly onUnauthorized: (path: string) => void;

    constructor(onUnauthorized: (path: string) => void = (path) => window.location.assign(path)) {
        this.onUnauthorized = onUnauthorized;
    }

    setToken(token: string) {
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
    }

    private redirectToLogin() {
        this.onUnauthorized('/login');
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
        return this.request<User>('/users/me');
    }

    async setName(fullName: string): Promise<User> {
        return this.request<User>('/users/me/set-name', {
            method: 'POST',
            body: JSON.stringify({ full_name: fullName }),
        });
    }

    async getAllUsers(params?: Record<string, string | number | boolean | undefined>): Promise<User[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) queryParams.append(key, String(value));
            });
        }
        return this.request<User[]>(`/users?${queryParams}`);
    }

    async getUserStats() {
        return this.request<{
            total_users: number;
            active_users: number;
            inactive_users: number;
            volunteers: number;
            team_leads: number;
            admins: number;
        }>('/users/stats/overview');
    }

    async updateUser(userId: string, data: {
        name?: string;
        team?: string;
        role?: 'volunteer' | 'team_lead' | 'admin';
        is_active?: boolean;
    }): Promise<User> {
        return this.request<User>(`/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    // Invites
    async getInvites(): Promise<AllowedEmail[]> {
        return this.request<AllowedEmail[]>('/invites');
    }

    async inviteUser(data: InviteCreate): Promise<AllowedEmail> {
        return this.request<AllowedEmail>('/invites', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async revokeInvite(email: string): Promise<void> {
        return this.request<void>(`/invites/${email}`, {
            method: 'DELETE',
        });
    }

    async resendInvite(email: string): Promise<void> {
        return this.request<void>(`/invites/${email}/resend`, {
            method: 'POST',
        });
    }

    // Submissions
    async getCurrentWeekInfo(): Promise<WeekInfo> {
        const data = await this.request<WeekInfo>('/submissions/current-week');
        return normalizeWeekInfo(data);
    }

    async getWorkCategories(): Promise<string[]> {
        const res = await this.request<{ categories: string[] }>('/submissions/categories');
        return res.categories;
    }

    async getLastWeekGoals(): Promise<{ goals: WorkEntry[]; from_week: string }> {
        return this.request<{ goals: WorkEntry[]; from_week: string }>('/submissions/last-week-goals');
    }

    async getHoursTrend(weeks = 8): Promise<HoursTrendPoint[]> {
        const res = await this.request<{ trend: HoursTrendPoint[] }>(`/submissions/hours-trend?weeks=${weeks}`);
        return res.trend;
    }

    async getAttendance(weeks = 12): Promise<AttendanceData> {
        return this.request<AttendanceData>(`/submissions/attendance?weeks=${weeks}`);
    }

    async getMySubmissions(): Promise<SubmissionSummary[]> {
        return this.request<SubmissionSummary[]>('/submissions/my');
    }

    async getSubmission(submissionId: string): Promise<Submission> {
        return this.request<Submission>(`/submissions/${submissionId}`);
    }

    async getAllSubmissions(params?: Record<string, string | number | boolean | undefined>): Promise<SubmissionSummary[]> {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) queryParams.append(key, String(value));
            });
        }
        return this.request<SubmissionSummary[]>(`/submissions?${queryParams}`);
    }

    async createOrUpdateSubmission(data: {
        past_work: WorkEntry[];
        present_work: WorkEntry[];
        future_work: WorkEntry[];
        blockers?: string;
        notes?: string;
        mood_rating?: number;
    }): Promise<Submission> {
        return this.request<Submission>('/submissions', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async submitSubmission(submissionId: string): Promise<Submission> {
        return this.request<Submission>(`/submissions/${submissionId}/submit`, {
            method: 'POST',
        });
    }

    async reviewSubmission(submissionId: string, adminNotes?: string): Promise<Submission> {
        return this.request<Submission>(`/submissions/${submissionId}/review`, {
            method: 'POST',
            body: JSON.stringify({ admin_notes: adminNotes }),
        });
    }

    async getSubmissionStats(weekId?: string) {
        const queryParams = weekId ? `?week_id=${weekId}` : '';
        return this.request<{
            week_id: string;
            this_week: {
                total_drafts: number;
                total_submitted: number;
                total_hours: number;
                blockers_count: number;
            };
            all_time: { total_submissions: number };
        }>(`/submissions/stats/overview${queryParams}`);
    }

    // Comments
    async getComments(submissionId: string): Promise<Comment[]> {
        return this.request<Comment[]>(`/comments/submission/${submissionId}`);
    }

    async createComment(submissionId: string, content: string, parentId?: string): Promise<Comment> {
        return this.request<Comment>(`/comments/submission/${submissionId}`, {
            method: 'POST',
            body: JSON.stringify({ content, parent_id: parentId }),
        });
    }

    // Files / Google Drive
    async getDriveStatus(): Promise<{ configured: boolean; message: string; storage_type: 'shared_drive' | 's3' | 'local'; folder_name?: string }> {
        return this.request<{ configured: boolean; message: string; storage_type: 'shared_drive' | 's3' | 'local'; folder_name?: string }>('/files/drive-status');
    }

    async uploadFile(file: File, weekId?: string): Promise<UploadedFile> {
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
                    week_id: weekId,
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

            return uploadPlan;
        }

        const formData = new FormData();
        formData.append('file', file);
        if (weekId) {
            formData.append('week_id', weekId);
        }

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

        return response.json();
    }

    async uploadMultipleFiles(files: File[], weekId?: string): Promise<UploadedFile[]> {
        const uploads: UploadedFile[] = [];
        for (const file of files) {
            uploads.push(await this.uploadFile(file, weekId));
        }
        return uploads;
    }

    async getFolderLink(weekId?: string): Promise<{ folder_link: string | null; week_id?: string }> {
        const queryParams = weekId ? `?week_id=${weekId}` : '';
        return this.request<{ folder_link: string | null; week_id?: string }>(`/files/folder-link${queryParams}`);
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
        return this.request<FileInfo[]>(`/files/list${qs ? `?${qs}` : ''}`);
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
        return this.request<{ success: boolean; message: string }>(`/files/${fileId}`, {
            method: 'DELETE',
        });
    }

    // Notifications
    async getEmailStatus(): Promise<{ configured: boolean; message: string }> {
        return this.request<{ configured: boolean; message: string }>('/notifications/email-status');
    }

    async sendReminders(weekId?: string): Promise<ReminderResult> {
        const qs = weekId ? `?week_id=${weekId}` : '';
        return this.request<ReminderResult>(`/notifications/send-reminders${qs}`, {
            method: 'POST',
        });
    }

    // Projects
    async getProjects(status?: string): Promise<Project[]> {
        const qs = status ? `?status=${status}` : '';
        return this.request<Project[]>(`/projects${qs}`);
    }

    async getProject(projectId: string): Promise<Project> {
        return this.request<Project>(`/projects/${projectId}`);
    }

    async createProject(data: ProjectCreate): Promise<Project> {
        return this.request<Project>('/projects', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateProject(projectId: string, data: Partial<ProjectCreate>): Promise<Project> {
        return this.request<Project>(`/projects/${projectId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async addProjectMember(projectId: string, userId: string): Promise<Project> {
        return this.request<Project>(`/projects/${projectId}/members/${userId}`, {
            method: 'POST',
        });
    }

    async removeProjectMember(projectId: string, userId: string): Promise<Project> {
        return this.request<Project>(`/projects/${projectId}/members/${userId}`, {
            method: 'DELETE',
        });
    }

    async deleteProject(projectId: string): Promise<void> {
        return this.request<void>(`/projects/${projectId}`, {
            method: 'DELETE',
        });
    }

    async getProjectWorkItems(projectId: string): Promise<ProjectWorkItem[]> {
        return this.request<ProjectWorkItem[]>(`/projects/${projectId}/work-items`);
    }

    async createProjectWorkItem(projectId: string, data: ProjectWorkItemCreate): Promise<ProjectWorkItem> {
        return this.request<ProjectWorkItem>(`/projects/${projectId}/work-items`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateProjectWorkItem(projectId: string, workItemId: string, data: Partial<ProjectWorkItemCreate>): Promise<ProjectWorkItem> {
        return this.request<ProjectWorkItem>(`/projects/${projectId}/work-items/${workItemId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async deleteProjectWorkItem(projectId: string, workItemId: string): Promise<void> {
        return this.request<void>(`/projects/${projectId}/work-items/${workItemId}`, {
            method: 'DELETE',
        });
    }

    async getProjectJoinRequests(projectId: string): Promise<ProjectJoinRequest[]> {
        return this.request<ProjectJoinRequest[]>(`/projects/${projectId}/join-requests`);
    }

    async requestProjectAccess(projectId: string, data: ProjectJoinRequestCreate): Promise<ProjectJoinRequest> {
        return this.request<ProjectJoinRequest>(`/projects/${projectId}/join-requests`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async reviewProjectJoinRequest(
        projectId: string,
        joinRequestId: string,
        status: 'approved' | 'declined'
    ): Promise<ProjectJoinRequest> {
        return this.request<ProjectJoinRequest>(`/projects/${projectId}/join-requests/${joinRequestId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    }

    // Settings
    async getSettings(): Promise<AdminSettings> {
        const data = await this.request<AdminSettings>('/settings');
        return normalizeAdminSettings(data);
    }

    async updateSettings(data: AdminSettings): Promise<{ success: boolean; settings: AdminSettings }> {
        const response = await this.request<{ success: boolean; settings: AdminSettings }>('/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return {
            ...response,
            settings: normalizeAdminSettings(response.settings),
        };
    }

    // Delegated admin access
    async getAdminAccessGrants(): Promise<AdminAccessGrant[]> {
        return this.request<AdminAccessGrant[]>('/admin-access/grants');
    }

    async createAdminAccessGrant(data: AdminAccessGrantCreate): Promise<AdminAccessGrant> {
        return this.request<AdminAccessGrant>('/admin-access/grants', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async revokeAdminAccessGrant(grantId: string): Promise<void> {
        return this.request<void>(`/admin-access/grants/${grantId}`, {
            method: 'DELETE',
        });
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
        return this.request<AuditLogEntry[]>(`/admin-access/audit-logs${qs ? `?${qs}` : ''}`);
    }

}

export const api = new ApiClient();
