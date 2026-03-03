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
    total_hours: number;
    total_submissions: number;
    submission_streak: number;
    created_at: string;
    last_login: string;
    profile_complete: boolean;
    file_access_expires?: string;
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
    submission_deadline: string;
    is_submission_window_open: boolean;
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
    fields?: any[];
}

export interface AdminSettings {
    settings_id: string;
    tags: string[];
    active_projects: string[];
    form_sections: FormSection[];
}

export interface Project {
    id: string;
    name: string;
    description: string;
    status: 'active' | 'completed' | 'on_hold' | 'planned';
    tags?: string[];
    banner_image?: string;
    lead?: User;
    members: User[];
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


class ApiClient {
    private token: string | null = null;

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
                window.location.href = '/login';
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
        return this.request<WeekInfo>('/submissions/current-week');
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
    async getDriveStatus(): Promise<{ configured: boolean; message: string; storage_type: 'drive_org' | 'drive_personal' | 'local'; folder_name?: string }> {
        return this.request<{ configured: boolean; message: string; storage_type: 'drive_org' | 'drive_personal' | 'local'; folder_name?: string }>('/files/drive-status');
    }

    async uploadFile(file: File, weekId?: string): Promise<UploadedFile> {
        const token = this.getToken();
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
        const token = this.getToken();
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        if (weekId) {
            formData.append('week_id', weekId);
        }

        const response = await fetch(`${API_URL}/files/upload-multiple`, {
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

    // Settings
    async getSettings(): Promise<AdminSettings> {
        return this.request<AdminSettings>('/settings');
    }

    async updateSettings(data: AdminSettings): Promise<{ success: boolean; settings: AdminSettings }> {
        return this.request<{ success: boolean; settings: AdminSettings }>('/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

}

export const api = new ApiClient();
