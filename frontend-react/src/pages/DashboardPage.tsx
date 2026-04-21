import { useCallback, useEffect, useState } from 'react';
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
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, GuidancePanel, LoadingSpinner, StatCard } from '../components/ui';

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
    const dashboardGuidelines = canAccessAdminPortal
        ? [
            'Use the top action card for the current week, then move into the admin workspace only when you need to review or manage something.',
            'If blockers are reported, open those first. They usually signal a volunteer is waiting on help or approval.',
            'Submissions, users, settings, and projects are separated on purpose so each area stays focused and easier to scan.',
        ]
        : [
            'Use the highlighted weekly action to start, continue, or review your current submission.',
            'Open your submission history when you want past hours, statuses, or reviewer feedback.',
            'Use Projects to find active work, request access, and join project boards that match how you want to help.',
        ];

    return (
        <div className="page-wrapper">
            <Navbar />
            <main id="main-content" className="main-content">
                <div className="container dashboard-shell">
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
                        items={dashboardGuidelines}
                        icon={<FileText size={18} />}
                        tone="slate"
                        style={{ marginBottom: '1.5rem' }}
                    />

                    {canAccessAdminPortal && adminStats && (
                        <Card className="dashboard-admin-card">
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
                                />
                                <AdminMetric
                                    label="Drafts open"
                                    value={adminStats.this_week.total_drafts}
                                    tone="warning"
                                    href={draftsOpenHref}
                                    actionLabel="Review open drafts"
                                />
                                <AdminMetric
                                    label="Blockers reported"
                                    value={adminStats.this_week.blockers_count}
                                    tone={adminStats.this_week.blockers_count > 0 ? 'danger' : 'default'}
                                    href={blockersReportedHref}
                                    actionLabel="View blocked updates"
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
                        <section className="dashboard-section">
                            <div className="dashboard-section-head" style={{ marginBottom: '1rem' }}>
                                <h2 className="dashboard-section-title">Your overview</h2>
                            </div>

                            <div className="dashboard-summary-grid">
                                <StatCard
                                    value={user?.total_submissions ?? 0}
                                    label="Total submissions"
                                    icon={<FileText size={24} />}
                                />
                                <StatCard
                                    value={(user?.total_hours ?? 0).toFixed(1)}
                                    label="Total hours"
                                    icon={<Clock3 size={24} />}
                                />
                                <StatCard
                                    value={user?.submission_streak ?? 0}
                                    label="Current streak"
                                    icon={<Flame size={24} />}
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
                                            <thead>
                                                <tr>
                                                    <th scope="col">Volunteer</th>
                                                    <th scope="col" className="hidden-mobile">Week</th>
                                                    <th scope="col">Status</th>
                                                    <th scope="col" className="hidden-mobile">Hours</th>
                                                    <th scope="col" className="hidden-mobile">Needs attention</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {recentTeamSubmissions.map((submission) => (
                                                    <tr key={submission.id}>
                                                        <td data-label="Volunteer"><strong>{submission.user_name}</strong></td>
                                                        <td data-label="Week" className="hidden-mobile">{submission.week_id}</td>
                                                        <td data-label="Status">
                                                            <Badge variant={submission.status as 'draft' | 'submitted' | 'reviewed'}>
                                                                {submission.status}
                                                            </Badge>
                                                        </td>
                                                        <td data-label="Hours" className="hidden-mobile">{submission.total_hours.toFixed(1)}h</td>
                                                        <td data-label="Needs attention" className="hidden-mobile">
                                                            {submission.has_blockers ? (
                                                                <Link
                                                                    to={buildAdminSubmissionsHref({ view: 'blockers', week: submission.week_id, q: submission.user_name })}
                                                                    style={{ color: 'var(--color-error)', fontWeight: 600, textDecoration: 'none' }}
                                                                >
                                                                    Blockers
                                                                </Link>
                                                            ) : (
                                                                <span style={{ color: 'var(--color-text-muted)' }}>None</span>
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
                                        <thead>
                                            <tr>
                                                <th scope="col">Week</th>
                                                <th scope="col">Status</th>
                                                <th scope="col" className="hidden-mobile">Hours</th>
                                                <th scope="col" className="hidden-mobile">Submitted</th>
                                                <th scope="col">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentSubmissions.map((submission) => (
                                                <tr key={submission.id}>
                                                    <td data-label="Week"><strong>{submission.week_id}</strong></td>
                                                    <td data-label="Status">
                                                        <Badge variant={submission.status as 'draft' | 'submitted' | 'reviewed'}>
                                                            {submission.status}
                                                        </Badge>
                                                    </td>
                                                    <td data-label="Hours" className="hidden-mobile">{submission.total_hours.toFixed(1)}h</td>
                                                    <td data-label="Submitted" className="hidden-mobile">
                                                        {submission.submitted_at
                                                            ? format(parseISO(submission.submitted_at), 'MMM d, yyyy')
                                                            : 'Not submitted'}
                                                    </td>
                                                    <td data-label="Action">
                                                        <Link to={`/submissions/${submission.id}`}>
                                                            <Button variant="ghost" size="sm">Open</Button>
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
}: {
    label: string;
    value: number;
    tone: 'default' | 'warning' | 'danger';
    href?: string;
    actionLabel?: string;
}) {
    const styleByTone = {
        default: {
            background: 'white',
            valueColor: 'var(--color-text-primary)',
        },
        warning: {
            background: 'var(--color-warning-bg)',
            valueColor: '#b45309',
        },
        danger: {
            background: 'var(--color-error-bg)',
            valueColor: 'var(--color-error)',
        },
    };

    const styles = styleByTone[tone];

    const content = (
        <div
            className="dashboard-admin-metric"
            style={{
                background: styles.background,
                cursor: href ? 'pointer' : 'default',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
        >
            <div className="dashboard-admin-value" style={{ color: styles.valueColor }}>{value}</div>
            <div className="dashboard-admin-label">{label}</div>
            {href && (
                <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', fontWeight: 700, color: styles.valueColor, opacity: 0.85 }}>
                    {actionLabel ?? 'Open queue'}
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
