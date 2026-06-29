import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, differenceInDays, differenceInHours, isPast } from 'date-fns';
import {
    AlertCircle,
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Clock3,
    Edit3,
    FileText,
    Flame,
    PlusCircle,
    Shield,
    Timer,
} from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import type { SubmissionSummary, WeekInfo } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, LoadingSpinner, StatCard, GuidancePanel, InfoTooltip } from '../components/ui';

interface AdminStats {
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

interface CurrentWeekAction {
    title: string;
    description: string;
    buttonLabel: string;
    buttonVariant: 'primary' | 'outline';
    href: string;
    secondaryHref?: string;
    secondaryLabel?: string;
}

type SubmissionQueueView = 'needs-review' | 'blockers' | 'drafts' | 'reviewed' | 'all';

function buildAdminSubmissionsHref(filters: {
    view?: SubmissionQueueView;
    week?: string;
    status?: 'draft' | 'submitted' | 'reviewed';
    q?: string;
}) {
    const queryParams = new URLSearchParams();

    if (filters.view) {
        queryParams.set('view', filters.view);
    }
    if (filters.week) {
        queryParams.set('week', filters.week);
    }
    if (filters.status) {
        queryParams.set('status', filters.status);
    }
    if (filters.q) {
        queryParams.set('q', filters.q);
    }

    const queryString = queryParams.toString();
    return queryString ? `/admin/submissions?${queryString}` : '/admin/submissions';
}

function getCurrentWeekAction(weekInfo: WeekInfo | null): CurrentWeekAction {
    if (!weekInfo) {
        return {
            title: 'Open your submissions',
            description: 'We are loading your current week details.',
            buttonLabel: 'Open submissions',
            buttonVariant: 'outline',
            href: '/submissions',
        };
    }

    const weekNumber = weekInfo.week_id.split('-W')[1];
    const now = new Date();
    const windowStart = parseISO(weekInfo.submission_window_start);

    if (weekInfo.has_submission && weekInfo.submission_id) {
        const isDraft = weekInfo.submission_status === 'draft';

        return {
            title: isDraft ? `Continue your W${weekNumber} draft` : `Review your W${weekNumber} update`,
            description: isDraft
                ? 'Pick up where you left off and submit when you are ready.'
                : 'Your update is already in. Reopen it if you want to review the details.',
            buttonLabel: isDraft ? 'Continue update' : 'View update',
            buttonVariant: isDraft ? 'primary' : 'outline',
            href: `/submissions/${weekInfo.submission_id}`,
            secondaryHref: '/submissions',
            secondaryLabel: 'Open history',
        };
    }

    if (weekInfo.submission_deadline) {
        const deadline = parseISO(weekInfo.submission_deadline);

        if (!weekInfo.is_submission_window_open && now < windowStart) {
            return {
                title: `W${weekNumber} opens soon`,
                description: `Submissions open on ${format(windowStart, 'EEE, MMM d h:mm a')}.`,
                buttonLabel: 'View history',
                buttonVariant: 'outline',
                href: '/submissions',
            };
        }

        if (isPast(deadline)) {
            if (!weekInfo.allow_late_submissions) {
                return {
                    title: `W${weekNumber} window closed`,
                    description: 'This week\'s update window has ended. Reach out to an admin if it needs to reopen.',
                    buttonLabel: 'View history',
                    buttonVariant: 'outline',
                    href: '/submissions',
                };
            }

            return {
                title: `Start your W${weekNumber} update`,
                description: 'The deadline passed, but you can still submit a late check-in.',
                buttonLabel: `Start W${weekNumber}`,
                buttonVariant: 'primary',
                href: '/submissions/new',
                secondaryHref: '/submissions',
                secondaryLabel: 'View history',
            };
        }

        const hoursLeft = differenceInHours(deadline, new Date());
        const daysLeft = differenceInDays(deadline, new Date());
        const urgencyCopy = hoursLeft < 24
            ? `Deadline coming up soon: ${hoursLeft}h left.`
            : `${daysLeft}d ${hoursLeft % 24}h left before this week's deadline.`;

        return {
            title: `Start your W${weekNumber} update`,
            description: urgencyCopy,
            buttonLabel: `Start W${weekNumber}`,
            buttonVariant: 'primary',
            href: '/submissions/new',
            secondaryHref: '/submissions',
            secondaryLabel: 'View history',
        };
    }

    return {
        title: `Start your W${weekNumber} update`,
        description: 'Capture your past, present, and next steps in one place.',
        buttonLabel: `Start W${weekNumber}`,
        buttonVariant: 'primary',
        href: '/submissions/new',
        secondaryHref: '/submissions',
        secondaryLabel: 'View history',
    };
}

function getDeadlineSummary(weekInfo: WeekInfo | null): string {
    if (!weekInfo?.submission_deadline) {
        return 'No deadline information yet';
    }

    const windowStart = parseISO(weekInfo.submission_window_start);
    const deadline = parseISO(weekInfo.submission_deadline);
    const now = new Date();

    if (!weekInfo.is_submission_window_open && now < windowStart) {
        return `Opens ${format(windowStart, 'EEE, MMM d h:mm a')}`;
    }

    if (isPast(deadline)) {
        return weekInfo.allow_late_submissions
            ? `Late submissions are allowed after ${format(deadline, 'EEE, MMM d h:mm a')}`
            : `Deadline passed on ${format(deadline, 'EEE, MMM d h:mm a')}`;
    }

    const hoursLeft = differenceInHours(deadline, new Date());
    const daysLeft = differenceInDays(deadline, new Date());

    if (hoursLeft < 24) {
        return `${hoursLeft}h remaining`;
    }

    return `${daysLeft}d ${hoursLeft % 24}h remaining`;
}

export default function DashboardPage() {
    const navigate = useNavigate();
    const {
        user,
        isLoading: authLoading,
        isAuthenticated,
        isAdmin,
        isTeamLead,
        canAccessAdminPortal,
        hasAdminScope,
        isDelegatedAdmin,
    } = useAuth();

    const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
    const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
    const [allSubmissions, setAllSubmissions] = useState<SubmissionSummary[]>([]);
    const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
    const [reminderSending, setReminderSending] = useState(false);
    const [reminderResult, setReminderResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Accordion states - open by default on desktop, closed on mobile
    const [isTeamExpanded, setIsTeamExpanded] = useState(window.innerWidth >= 768);
    const [isUpdatesExpanded, setIsUpdatesExpanded] = useState(window.innerWidth >= 768);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate('/login');
        }
    }, [authLoading, isAuthenticated, navigate]);

    const loadData = useCallback(async () => {
        try {
            setIsLoading(true);

            const [week, mySubmissions] = await Promise.all([
                api.getCurrentWeekInfo(),
                api.getMySubmissions(),
            ]);

            setWeekInfo(week);
            setSubmissions(mySubmissions);

            if (canAccessAdminPortal && hasAdminScope('review_submissions')) {
                const [stats, teamSubmissions] = await Promise.all([
                    api.getSubmissionStats(),
                    api.getAllSubmissions({ limit: 5 }),
                ]);
                setAdminStats(stats);
                setAllSubmissions(teamSubmissions);
            } else {
                setAdminStats(null);
                setAllSubmissions([]);
            }
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [canAccessAdminPortal, hasAdminScope]);

    useEffect(() => {
        if (isAuthenticated) {
            void loadData();
        }
    }, [isAuthenticated, loadData]);

    const handleSendReminders = async () => {
        setReminderSending(true);
        setReminderResult(null);

        try {
            const result = await api.sendReminders();
            setReminderResult(result.message);
            setTimeout(() => setReminderResult(null), 6000);
        } catch (err) {
            setReminderResult(err instanceof Error ? err.message : 'Failed to send reminders');
        } finally {
            setReminderSending(false);
        }
    };

    if (authLoading || !isAuthenticated) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    const weekNumber = weekInfo?.week_id.split('-W')[1];
    const weekAction = getCurrentWeekAction(weekInfo);
    const recentSubmissions = submissions.slice(0, 4);
    const recentTeamSubmissions = allSubmissions.slice(0, 5);
    const hasSubmissionStatus = weekInfo?.has_submission && weekInfo.submission_status;
    const canEditUsers = hasAdminScope('edit_users') || hasAdminScope('manage_users');
    const canManageUserStatus = hasAdminScope('manage_user_status') || hasAdminScope('manage_users');
    const canManageUserRoles = hasAdminScope('manage_user_roles');
    const canViewUsers = hasAdminScope('view_users') || canEditUsers || canManageUserStatus || canManageUserRoles;
    const canViewAdminAccess = hasAdminScope('view_admin_access') || hasAdminScope('manage_admin_access');
    const canManageAdminAccess = hasAdminScope('manage_admin_access');
    const hasUserAccess = canViewUsers || hasAdminScope('manage_invites') || canViewAdminAccess;
    const hasSubmissionAccess = hasAdminScope('review_submissions');
    const canSendReminders = hasAdminScope('send_reminders');
    const currentAdminWeek = adminStats?.week_id ?? weekInfo?.week_id;
    const submittedThisWeekHref = buildAdminSubmissionsHref({ view: 'all', week: currentAdminWeek });
    const draftsOpenHref = buildAdminSubmissionsHref({ view: 'drafts', week: currentAdminWeek, status: 'draft' });
    const blockersReportedHref = buildAdminSubmissionsHref({ view: 'blockers', week: currentAdminWeek });

    return (
        <div className="page-wrapper">
            <Navbar />
            <main id="main-content" className="main-content">
                <div className="container dashboard-shell" style={{ padding: '0.5rem 1rem', maxWidth: '100%', margin: '0 auto' }}>
                    <section className="dashboard-hero">
                        <div className="dashboard-hero-copy">
                            <p className="dashboard-eyebrow">
                                {isAdmin ? 'Admin' : isDelegatedAdmin ? 'Delegated admin' : isTeamLead ? 'Team lead' : 'Volunteer'}
                            </p>
                            <h1 className="dashboard-hero-title">
                                Welcome, {user?.name.split(' ')[0] || 'User'}
                            </h1>
                            <div className="dashboard-pill-row" style={{ marginTop: '0.75rem' }}>
                                {weekNumber && <span className="dashboard-pill">Week {weekNumber}</span>}
                                {hasSubmissionStatus && (
                                    <Badge variant={weekInfo.submission_status as 'draft' | 'submitted' | 'reviewed'}>
                                        {weekInfo.submission_status}
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="dashboard-hero-panel">
                            <p className="dashboard-panel-label hidden-mobile">This week</p>
                            <h2 className="dashboard-panel-title">{weekAction.title}</h2>
                            <p className="dashboard-panel-copy hidden-mobile">{weekAction.description}</p>

                            {weekInfo && (
                                <div className="dashboard-panel-meta hidden-mobile">
                                    <div className="dashboard-panel-meta-item">
                                        <Clock3 size={16} />
                                        <span>{getDeadlineSummary(weekInfo)}</span>
                                    </div>
                                    <div className="dashboard-panel-meta-item">
                                        <Timer size={16} />
                                        <span>
                                            {format(parseISO(weekInfo.week_start), 'MMM d')} - {format(parseISO(weekInfo.week_end), 'MMM d')}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="dashboard-action-row">
                                <Link to={weekAction.href}>
                                    <Button variant={weekAction.buttonVariant}>
                                        {weekInfo?.has_submission ? <Edit3 size={18} /> : <PlusCircle size={18} />}
                                        {weekAction.buttonLabel}
                                    </Button>
                                </Link>
                                {weekAction.secondaryHref && weekAction.secondaryLabel && (
                                    <Link to={weekAction.secondaryHref}>
                                        <Button variant="secondary">
                                            <FileText size={18} />
                                            {weekAction.secondaryLabel}
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </section>

                    <GuidancePanel
                        title={canAccessAdminPortal ? 'How To Use This Workspace' : 'Quick Navigation Guide'}
                        description={canAccessAdminPortal
                            ? 'The dashboard is the fastest way to decide what needs attention right now.'
                            : 'This page is your launch point for weekly updates and project coordination.'}
                        items={[
                            'Watch the pending week alert at the top to know when you need to submit hours.',
                            'Your streak shows consecutive weeks submitted. Keep it up!',
                            'Check your current projects below to open a board and review tasks.'
                        ]}
                        icon={<AlertCircle size={16} />}
                        tone="slate"
                        style={{ marginBottom: '0.5rem' }}
                    />

                    {canAccessAdminPortal && adminStats && (
                        <Card className="dashboard-admin-card" style={{ padding: '0.5rem' }}>
                            <CardHeader>
                                <div className="dashboard-section-head">
                                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Shield size={20} />
                                        Admin portal overview
                                    </CardTitle>
                                </div>
                            </CardHeader>

                            <div className="dashboard-admin-grid">
                                <AdminMetric
                                    label="Submitted this week"
                                    value={adminStats.this_week.total_submitted}
                                    tone="default"
                                    href={submittedThisWeekHref}
                                    actionLabel="Open this week's queue"
                                    info="Number of updates successfully submitted by the team"
                                    icon={<FileText size={20} />}
                                />
                                <AdminMetric
                                    label="Drafts open"
                                    value={adminStats.this_week.total_drafts}
                                    tone="warning"
                                    href={draftsOpenHref}
                                    actionLabel="Review open drafts"
                                    info="Updates that volunteers have started but not yet submitted"
                                    icon={<Edit3 size={20} />}
                                />
                                <AdminMetric
                                    label="Blockers reported"
                                    value={adminStats.this_week.blockers_count}
                                    tone={adminStats.this_week.blockers_count > 0 ? 'danger' : 'default'}
                                    href={blockersReportedHref}
                                    actionLabel="View blocked updates"
                                    info="Critical issues or blockers reported by volunteers this week"
                                    icon={<Flame size={20} />}
                                />
                            </div>

                            {reminderResult && (
                                <div className={`dashboard-feedback ${reminderResult.toLowerCase().includes('failed') ? 'dashboard-feedback-error' : ''}`}>
                                    {reminderResult}
                                </div>
                            )}

                            <div className="dashboard-action-row">
                                {hasSubmissionAccess && (
                                    <Link to="/admin/submissions">
                                        <Button variant="primary">
                                            <FileText size={18} />
                                            Review submissions
                                        </Button>
                                    </Link>
                                )}
                                {hasUserAccess && (
                                    <Link to="/admin/users">
                                        <Button variant="secondary">
                                            <Shield size={18} />
                                            {canManageAdminAccess
                                                ? 'Manage access'
                                                : (canEditUsers || canManageUserStatus || canManageUserRoles)
                                                    ? 'Manage users'
                                                    : hasAdminScope('manage_invites')
                                                        ? 'Manage invites'
                                                        : canViewAdminAccess
                                                            ? 'View access'
                                                            : 'View users'}
                                        </Button>
                                    </Link>
                                )}
                                {canSendReminders && (
                                    <Button variant="outline" onClick={handleSendReminders} isLoading={reminderSending}>
                                        <AlertCircle size={18} />
                                        Send reminders
                                    </Button>
                                )}
                            </div>
                        </Card>
                    )}

                    {(!canAccessAdminPortal || !hasSubmissionAccess) && (
                        <section className="dashboard-section" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div className="dashboard-section-head">
                                <h2 className="dashboard-section-title" style={{ fontSize: '1.1rem', marginBottom: 0 }}>Your overview</h2>
                            </div>

                            <div className="dashboard-summary-grid">
                                <StatCard
                                    value={user?.total_submissions ?? 0}
                                    label="Total submissions"
                                    icon={<FileText size={24} />}
                                    info="The total number of weekly updates you have submitted"
                                />
                                <StatCard
                                    value={(user?.total_hours ?? 0).toFixed(1)}
                                    label="Credited hours"
                                    icon={<Clock3 size={24} />}
                                    info="Your total recorded volunteer hours"
                                />
                                <StatCard
                                    value={user?.submission_streak ?? 0}
                                    label="Current streak"
                                    icon={<Flame size={24} />}
                                    info="Consecutive weeks you've submitted an update"
                                />
                            </div>
                        </section>
                    )}

                    {canAccessAdminPortal && (
                        <Card>
                            <CardHeader>
                                <div 
                                    className="dashboard-section-head flex-between" 
                                    onClick={() => setIsTeamExpanded(!isTeamExpanded)}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    aria-expanded={isTeamExpanded}
                                >
                                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                        Team recent updates
                                        {isTeamExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </CardTitle>
                                    {isTeamExpanded && (
                                        <Link to={buildAdminSubmissionsHref({})} onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="sm">
                                                View all <ArrowRight size={16} />
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </CardHeader>

                            {isTeamExpanded && (
                                isLoading ? (
                                    <LoadingSpinner size={30} />
                                ) : recentTeamSubmissions.length > 0 ? (
                                    <div className="table-wrapper">
                                        <table className="table">
                                            <caption className="sr-only">
                                                Five recent volunteer submissions with status, hours, and whether they need attention.
                                            </caption>
                                            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <tr>
                                                    <th scope="col" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Volunteer</th>
                                                    <th scope="col" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Week</th>
                                                    <th scope="col" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Status</th>
                                                    <th scope="col" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Hours</th>
                                                    <th scope="col" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Needs attention</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {recentTeamSubmissions.map((submission) => (
                                                    <tr key={submission.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50">
                                                        <td data-label="Volunteer" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}><strong style={{ color: '#0f172a' }}>{submission.user_name}</strong></td>
                                                        <td data-label="Week" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#475569' }}>{submission.week_id}</td>
                                                        <td data-label="Status" style={{ padding: '0.25rem 0.5rem' }}>
                                                            <div style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                                                                <Badge variant={submission.status as 'draft' | 'submitted' | 'reviewed'}>
                                                                    {submission.status}
                                                                </Badge>
                                                            </div>
                                                        </td>
                                                        <td data-label="Hours" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#475569' }}>{(submission.reported_hours ?? submission.total_hours).toFixed(1)}h</td>
                                                        <td data-label="Needs attention" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                                                            {submission.has_blockers ? (
                                                                <Link
                                                                    to={buildAdminSubmissionsHref({ view: 'blockers', week: submission.week_id, q: submission.user_name })}
                                                                    style={{ color: 'var(--color-error)', fontWeight: 600, textDecoration: 'none', padding: '0.15rem 0.35rem', background: 'var(--color-error-bg)', borderRadius: '4px' }}
                                                                >
                                                                    Blockers
                                                                </Link>
                                                            ) : (
                                                                <span style={{ color: '#94a3b8' }}>None</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <EmptyState
                                        icon={<FileText size={48} />}
                                        title="No team submissions yet"
                                        description="Recent volunteer activity will appear here once check-ins start coming in."
                                    />
                                )
                            )}
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <div 
                                className="dashboard-section-head flex-between"
                                onClick={() => setIsUpdatesExpanded(!isUpdatesExpanded)}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                                aria-expanded={isUpdatesExpanded}
                            >
                                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                    Your recent updates
                                    {isUpdatesExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </CardTitle>
                                {isUpdatesExpanded && (
                                    <Link to="/submissions" onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="sm">
                                            View all <ArrowRight size={16} />
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </CardHeader>

                        {isUpdatesExpanded && (
                            isLoading ? (
                                <LoadingSpinner size={30} />
                            ) : recentSubmissions.length > 0 ? (
                                <div className="table-wrapper">
                                    <table className="table">
                                        <caption className="sr-only">
                                            Your most recent submissions with status, hours, submission date, and a link to open each entry.
                                        </caption>
                                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <tr>
                                                <th scope="col" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Week</th>
                                                <th scope="col" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Status</th>
                                                <th scope="col" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Hours</th>
                                                <th scope="col" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Submitted</th>
                                                <th scope="col" style={{ padding: '0.25rem 0.5rem', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentSubmissions.map((submission) => (
                                                <tr key={submission.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50">
                                                    <td data-label="Week" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}><strong style={{ color: '#0f172a' }}>{submission.week_id}</strong></td>
                                                    <td data-label="Status" style={{ padding: '0.25rem 0.5rem' }}>
                                                        <div style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                                                            <Badge variant={submission.status as 'draft' | 'submitted' | 'reviewed'}>
                                                                {submission.status}
                                                            </Badge>
                                                        </div>
                                                    </td>
                                                    <td data-label="Hours" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#475569' }}>{(submission.reported_hours ?? submission.total_hours).toFixed(1)}h</td>
                                                    <td data-label="Submitted" className="hidden-mobile" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#475569' }}>
                                                        {submission.submitted_at
                                                            ? format(parseISO(submission.submitted_at), 'MMM d, yyyy')
                                                            : 'Not submitted'}
                                                    </td>
                                                    <td data-label="Action" style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>
                                                        <Link to={`/submissions/${submission.id}`}>
                                                            <Button variant="ghost" size="sm" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}>Open</Button>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyState
                                    icon={<FileText size={48} />}
                                    title="No submissions yet"
                                    description="Once you create a check-in, the latest entries will show up here."
                                    action={(
                                        <Link to="/submissions/new">
                                            <Button variant="primary">Create first submission</Button>
                                        </Link>
                                    )}
                                />
                            )
                        )}
                    </Card>
                </div>
            </main>
            <Footer />
        </div>
    );
}

function AdminMetric({
    label,
    value,
    tone,
    href,
    actionLabel,
    info,
    icon,
}: {
    label: string;
    value: number;
    tone: 'default' | 'warning' | 'danger';
    href?: string;
    actionLabel?: string;
    info?: string;
    icon?: ReactNode;
}) {
    const toneStyles = {
        default: { chipBg: '#eef2ff', chipColor: '#4f46e5', valueColor: 'var(--color-text-primary)' },
        warning: { chipBg: '#fef3e2', chipColor: '#b45309', valueColor: '#b45309' },
        danger: { chipBg: '#fee2e2', chipColor: '#b42318', valueColor: '#b42318' },
    }[tone];

    const content = (
        <div className="dashboard-admin-metric" data-clickable={href ? 'true' : undefined}>
            {icon && (
                <div className="dashboard-admin-metric-icon" style={{ background: toneStyles.chipBg, color: toneStyles.chipColor }}>
                    {icon}
                </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
                <div className="dashboard-admin-value" style={{ color: toneStyles.valueColor }}>{value}</div>
                <div className="dashboard-admin-label">
                    {label}
                    {info && <InfoTooltip content={info} />}
                </div>
            </div>
            {href && actionLabel && (
                <div className="dashboard-admin-cta">
                    {actionLabel}
                    <ArrowRight size={13} />
                </div>
            )}
        </div>
    );

    if (!href) {
        return content;
    }

    return (
        <Link
            to={href}
            style={{ textDecoration: 'none', display: 'block' }}
            aria-label={`${label}: ${actionLabel ?? 'Open queue'}`}
        >
            {content}
        </Link>
    );
}
