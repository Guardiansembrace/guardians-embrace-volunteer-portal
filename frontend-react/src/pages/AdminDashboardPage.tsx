import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import type { AuditLogEntry, ReminderResult } from '../lib/api';
import {
    formatAuditRelativeTime,
    getAuditActorLabel,
    getAuditHeadline,
    getAuditOutcomeLabel,
} from '../lib/auditTrail';
import { Navbar, Footer } from '../components/Layout';
import { Button, LoadingSpinner } from '../components/ui';
import {
    ArrowRight,
    BellRing,
    Users,
    FileText,
    Briefcase,
    Settings,
    Shield,
    AlertCircle,
    RefreshCw,
    Activity,
    History,
} from 'lucide-react';

interface AdminStats {
    users?: {
        total: number;
        active: number;
        volunteers: number;
        inactive: number;
    };
    submissions?: {
        submitted_this_week: number;
        drafts_open: number;
        this_week_hours: number;
        blockers: number;
    };
    projects: {
        active: number;
    };
}

export default function AdminDashboardPage() {
    const navigate = useNavigate();
    const {
        isAdmin,
        canAccessAdminPortal,
        hasAdminScope,
        isDelegatedAdmin,
        isLoading: authLoading,
        isAuthenticated,
    } = useAuth();
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
    const [reminderResult, setReminderResult] = useState<string | null>(null);
    const [isSendingReminder, setIsSendingReminder] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const canEditUsers = hasAdminScope('edit_users') || hasAdminScope('manage_users');
    const canManageUserStatus = hasAdminScope('manage_user_status') || hasAdminScope('manage_users');
    const canManageUserRoles = hasAdminScope('manage_user_roles');
    const canViewUsers = hasAdminScope('view_users') || canEditUsers || canManageUserStatus || canManageUserRoles;
    const canManageUsers = canEditUsers || canManageUserStatus || canManageUserRoles;
    const canManageInvites = hasAdminScope('manage_invites');
    const canReviewSubmissions = hasAdminScope('review_submissions');
    const canSendReminders = hasAdminScope('send_reminders');
    const canManageProjects = hasAdminScope('manage_projects');
    const canManageSettings = hasAdminScope('manage_settings');
    const canViewAuditLogs = hasAdminScope('view_audit_logs');
    const canViewAdminAccess = hasAdminScope('view_admin_access') || hasAdminScope('manage_admin_access');
    const canManageAdminAccess = hasAdminScope('manage_admin_access');

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !canAccessAdminPortal)) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, canAccessAdminPortal, navigate]);

    const loadStats = useCallback(async () => {
        try {
            setIsLoading(true);
            const requests = await Promise.all([
                canViewUsers ? api.getUserStats() : Promise.resolve(null),
                canReviewSubmissions ? api.getSubmissionStats() : Promise.resolve(null),
                api.getProjects('active'),
                canSendReminders ? api.getEmailStatus() : Promise.resolve(null),
                canViewAuditLogs ? api.getAuditLogs({ limit: 8 }) : Promise.resolve([]),
            ]);

            const [userStats, subStats, projects, emailStatus, recentAuditLogs] = requests;

            setStats({
                users: userStats ? {
                    total: userStats.total_users,
                    active: userStats.active_users,
                    volunteers: userStats.volunteers,
                    inactive: userStats.inactive_users,
                } : undefined,
                submissions: subStats ? {
                    submitted_this_week: subStats.this_week.total_submitted,
                    drafts_open: subStats.this_week.total_drafts,
                    this_week_hours: subStats.this_week.total_hours,
                    blockers: subStats.this_week.blockers_count,
                } : undefined,
                projects: {
                    active: projects.length,
                },
            });
            setEmailConfigured(emailStatus?.configured ?? null);
            setAuditLogs(recentAuditLogs);
        } catch (err) {
            console.error('Failed to load admin stats:', err);
        } finally {
            setIsLoading(false);
        }
    }, [canReviewSubmissions, canSendReminders, canViewAuditLogs, canViewUsers]);

    useEffect(() => {
        if (isAuthenticated && canAccessAdminPortal) {
            void loadStats();
        }
    }, [isAuthenticated, canAccessAdminPortal, loadStats]);

    const handleSendReminders = async () => {
        setIsSendingReminder(true);
        setReminderResult(null);

        try {
            const result: ReminderResult = await api.sendReminders();
            setReminderResult(result.message);
        } catch (err) {
            setReminderResult(err instanceof Error ? err.message : 'Failed to send reminders');
        } finally {
            setIsSendingReminder(false);
        }
    };

    if (authLoading || !isAuthenticated || !canAccessAdminPortal) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner size={50} />
            </div>
        );
    }

    return (
        <div className="page-wrapper" style={{ background: 'var(--color-bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <main id="main-content" className="main-content" style={{ flex: 1 }}>
                <div className="container" style={{ padding: '2.5rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
                    
                    {/* Minimalist, Impactful Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '3rem' }}>
                        <div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '999px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                                <Shield size={14} style={{ color: 'var(--color-primary-gold)' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>
                                    {isAdmin ? 'Administrator Workspace' : isDelegatedAdmin ? 'Delegated Admin Workspace' : 'Admin Workspace'}
                                </span>
                            </div>
                            <h1 style={{ margin: '0', fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                Command Center
                            </h1>
                            <p style={{ margin: '0.75rem 0 0', color: '#64748b', fontSize: '1.05rem', maxWidth: '550px', lineHeight: 1.5 }}>
                                Stay focused on what matters today. The portal only shows the areas you have been delegated to manage.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', alignSelf: 'center' }}>
                            <Button variant="ghost" onClick={loadStats} style={{ border: '1px solid #e2e8f0', background: 'white', color: '#334155' }}>
                                <RefreshCw size={16} /> <span style={{ marginLeft: '0.4rem' }}>Refresh</span>
                            </Button>
                            {canSendReminders && (
                                <Button 
                                    variant="primary" 
                                    onClick={handleSendReminders} 
                                    isLoading={isSendingReminder} 
                                    disabled={!emailConfigured}
                                    style={{ boxShadow: '0 4px 14px rgba(212, 175, 55, 0.4)' }}
                                >
                                    <BellRing size={16} /> <span style={{ marginLeft: '0.4rem' }}>Remind Team</span>
                                </Button>
                            )}
                        </div>
                    </div>

                    {reminderResult && (
                        <div style={{ 
                            padding: '1rem 1.25rem', 
                            marginBottom: '2.5rem', 
                            borderRadius: '0.75rem', 
                            background: reminderResult.toLowerCase().includes('failed') ? '#fef2f2' : '#f0fdf4',
                            border: `1px solid ${reminderResult.toLowerCase().includes('failed') ? '#fecaca' : '#bbf7d0'}`,
                            color: reminderResult.toLowerCase().includes('failed') ? '#b91c1c' : '#15803d',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            animation: 'slideDown 0.3s ease-out'
                        }}>
                            <AlertCircle size={18} /> {reminderResult}
                        </div>
                    )}

                    {isLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
                            <LoadingSpinner size={40} />
                        </div>
                    ) : (
                        <>
                            {/* Priority Action Metrics */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '4rem' }}>
                                {stats?.submissions && (
                                    <>
                                        <AdminMetric
                                            title="Blockers Reported"
                                            value={stats.submissions.blockers}
                                            icon={<AlertCircle size={22} />}
                                            tone={stats.submissions.blockers > 0 ? 'danger' : 'success'}
                                            subtext="Need your attention now"
                                        />
                                        <AdminMetric
                                            title="Drafts Open"
                                            value={stats.submissions.drafts_open}
                                            icon={<FileText size={22} />}
                                            tone={stats.submissions.drafts_open > 0 ? 'warning' : 'default'}
                                            subtext="Pending submission"
                                        />
                                        <AdminMetric
                                            title="Submitted this Week"
                                            value={stats.submissions.submitted_this_week}
                                            icon={<Activity size={22} />}
                                            tone="default"
                                            subtext={`${stats.submissions.this_week_hours.toFixed(1)} hours logged`}
                                        />
                                    </>
                                )}
                                {stats?.users && (
                                    <AdminMetric
                                        title="Inactive Volunteers"
                                        value={stats.users.inactive}
                                        icon={<Users size={22} />}
                                        tone={stats.users.inactive > 0 ? 'warning' : 'default'}
                                        subtext={`Out of ${stats.users.total} total`}
                                    />
                                )}
                                <AdminMetric
                                    title="Active Projects"
                                    value={stats?.projects.active ?? 0}
                                    icon={<Briefcase size={22} />}
                                    tone="default"
                                    subtext="Boards currently open"
                                />
                            </div>

                            {/* Workspaces Grid */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>Core Workspaces</h2>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {canReviewSubmissions && (
                                    <ActionCard
                                        title="Submission Queue"
                                        description="Review weekly updates, check blockers, and approve reports from volunteers."
                                        icon={<FileText size={24} />}
                                        href="/admin/submissions"
                                        metaAction="Open Queue"
                                    />
                                )}
                                {(canViewUsers || canManageInvites || canViewAdminAccess) && (
                                    <ActionCard
                                        title="User Directory"
                                        description={
                                            canManageAdminAccess
                                                ? 'Delegate admin responsibilities, review current grants, and coordinate invitations from one place.'
                                                : canManageUsers
                                                    ? 'Update user details, roles, and account status based on the permissions you were given.'
                                                : canManageInvites
                                                    ? 'Manage invitations and delegated access handoffs from one place.'
                                                    : canViewAdminAccess
                                                        ? 'Review who currently has delegated admin access and when those grants expire.'
                                                        : 'View the user directory and delegated access snapshots.'
                                        }
                                        icon={<Users size={24} />}
                                        href="/admin/users"
                                        metaAction={
                                            canManageAdminAccess
                                                ? 'Manage Access'
                                                : canManageUsers
                                                    ? 'Manage Users'
                                                    : canManageInvites
                                                        ? 'Manage Invites'
                                                        : canViewAdminAccess
                                                            ? 'View Access'
                                                            : 'View Directory'
                                        }
                                    />
                                )}
                                {canManageProjects && (
                                    <ActionCard
                                        title="Active Projects"
                                        description="Manage project boards, team assignments, work items, and join requests."
                                        icon={<Briefcase size={24} />}
                                        href="/projects"
                                        metaAction="Manage Projects"
                                    />
                                )}
                                {canManageSettings && (
                                    <ActionCard
                                        title="System Settings"
                                        description="Maintain submission forms, weekly schedule rules, global tags, and app settings."
                                        icon={<Settings size={24} />}
                                        href="/admin/settings"
                                        metaAction="Configure App"
                                        status={canSendReminders ? (emailConfigured ? 'Email OK' : 'No Email') : undefined}
                                    />
                                )}
                                {canViewAuditLogs && (
                                    <ActionCard
                                        title="Audit Trail"
                                        description="Review tracked write actions, delegated admin activity, and recent security events."
                                        icon={<History size={24} />}
                                        href="/admin/audit"
                                        metaAction="View Activity"
                                    />
                                )}
                            </div>

                            {canViewAuditLogs && (
                                <div style={{ marginTop: '3rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>Recent Audit Activity</h2>
                                        <Link
                                            to="/admin/audit"
                                            style={{
                                                color: 'var(--color-primary-gold-dark)',
                                                fontWeight: 700,
                                                textDecoration: 'none',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                            }}
                                        >
                                            View full trail <ArrowRight size={16} />
                                        </Link>
                                    </div>
                                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                                        {auditLogs.length > 0 ? auditLogs.map((log, index) => (
                                            <div
                                                key={log.id}
                                                style={{
                                                    padding: '1rem 1.25rem',
                                                    borderBottom: index === auditLogs.length - 1 ? 'none' : '1px solid #f1f5f9',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    gap: '1rem',
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>{getAuditHeadline(log)}</div>
                                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        {getAuditActorLabel(log)} - {getAuditOutcomeLabel(log)}
                                                    </div>
                                                    <div style={{ display: 'none' }}>
                                                        {(log.actor_name || log.actor_email || 'Unknown user')} · {log.action} · {log.success ? 'Success' : 'Failed'}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                    {formatAuditRelativeTime(log.created_at)}
                                                </div>
                                            </div>
                                        )) : (
                                            <div style={{ padding: '1.25rem', color: '#64748b' }}>No audit activity has been recorded yet.</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}

// ── Shared Metric Components ────────────────────────────────────────────────────────

function AdminMetric({ title, value, icon, tone, subtext }: { title: string, value: number, icon: React.ReactNode, tone: 'default' | 'warning' | 'danger' | 'success', subtext: string }) {
    const toneStyles = {
        default: { bg: 'white', border: '#e2e8f0', color: '#0f172a', iconBg: '#f1f5f9', iconColor: '#64748b' },
        warning: { bg: '#fffbeb', border: '#fde68a', color: '#b45309', iconBg: '#fef3c7', iconColor: '#d97706' },
        danger: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', iconBg: '#fee2e2', iconColor: '#ef4444' },
        success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', iconBg: '#dcfce3', iconColor: '#22c55e' }
    };

    const style = toneStyles[tone];

    return (
        <div style={{
            background: style.bg,
            border: `1px solid ${style.border}`,
            borderRadius: '16px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: tone === 'default' ? '#475569' : style.iconColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {title}
                </p>
                <div style={{ padding: '0.5rem', borderRadius: '50%', background: style.iconBg, color: style.iconColor }}>
                    {icon}
                </div>
            </div>
            <div>
                <h3 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800, color: style.color, lineHeight: 1, letterSpacing: '-0.02em' }}>
                    {value}
                </h3>
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: tone === 'default' ? '#64748b' : style.color, opacity: 0.9, fontWeight: 500 }}>
                    {subtext}
                </p>
            </div>
        </div>
    );
}

interface ActionCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    href: string;
    metaAction: string;
    status?: string;
}

function ActionCard({ title, description, icon, href, metaAction, status }: ActionCardProps) {
    // Add micro-interactions and glassmorphism hints
    return (
        <Link to={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
            <div style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '1.75rem',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                cursor: 'pointer'
            }} 
            onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.borderColor = 'var(--color-primary-gold)';
            }}
            onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.02)';
                e.currentTarget.style.borderColor = '#e2e8f0';
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'var(--color-primary-gold-light, #fef3c7)', color: 'var(--color-primary-gold)', boxShadow: 'inset 0 0 0 1px rgba(212, 175, 55, 0.1)' }}>
                        {icon}
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{title}</h3>
                </div>
                
                <p style={{ margin: '0 0 1.5rem', color: '#475569', fontSize: '0.95rem', lineHeight: 1.6, flex: 1 }}>
                    {description}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '1.25rem', marginTop: 'auto' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-gold)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {metaAction} <ArrowRight size={14} />
                    </span>
                    {status && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '999px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                            {status}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
}
