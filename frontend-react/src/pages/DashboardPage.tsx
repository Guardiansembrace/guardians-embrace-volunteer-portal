import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import type { WeekInfo, SubmissionSummary, HoursTrendPoint, AttendanceData } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Badge, StatCard, LoadingSpinner, EmptyState } from '../components/ui';
import { Clock, FileText, Calendar, AlertCircle, CheckCircle, PlusCircle, Edit, Users, Timer, Flame, BarChart3, Mail, CalendarCheck } from 'lucide-react';
import { format, parseISO, formatDistanceToNow, differenceInHours, differenceInDays, isPast } from 'date-fns';

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

interface UserStats {
    total_users: number;
    active_users: number;
    inactive_users: number;
    volunteers: number;
    admins: number;
}

export default function DashboardPage() {
    const navigate = useNavigate();
    const { user, isLoading: authLoading, isAuthenticated, isAdmin } = useAuth();

    const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
    const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
    const [allSubmissions, setAllSubmissions] = useState<SubmissionSummary[]>([]);
    const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
    const [userStats, setUserStats] = useState<UserStats | null>(null);
    const [hoursTrend, setHoursTrend] = useState<HoursTrendPoint[]>([]);
    const [attendance, setAttendance] = useState<AttendanceData | null>(null);
    const [reminderSending, setReminderSending] = useState(false);
    const [reminderResult, setReminderResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate('/login');
        }
    }, [authLoading, isAuthenticated, navigate]);

    useEffect(() => {
        if (isAuthenticated) {
            loadData();
        }
    }, [isAuthenticated, isAdmin]);

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

    const loadData = async () => {
        try {
            const [week, subs, trend, att] = await Promise.all([
                api.getCurrentWeekInfo(),
                api.getMySubmissions(),
                api.getHoursTrend(8),
                api.getAttendance(12),
            ]);
            setWeekInfo(week);
            setSubmissions(subs);
            setHoursTrend(trend);
            setAttendance(att);

            // Load admin-specific data
            if (isAdmin) {
                const [stats, uStats, allSubs] = await Promise.all([
                    api.getSubmissionStats(),
                    api.getUserStats(),
                    api.getAllSubmissions({ limit: 10 }),
                ]);
                setAdminStats(stats);
                setUserStats(uStats);
                setAllSubmissions(allSubs);
            }
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (authLoading || !isAuthenticated) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    const recentSubmissions = submissions.slice(0, 5);

    return (
        <div className="page-wrapper">
            <Navbar />
            <main className="main-content">
                <div className="container">
                    {/* Welcome Header */}
                    <div style={{ marginBottom: '2rem' }}>
                        <h1 style={{ marginBottom: '0.5rem' }}>
                            Welcome back, <span style={{ color: 'var(--color-primary-gold)' }}>{user?.name}</span>
                            {isAdmin && <span className="badge badge-admin" style={{ marginLeft: '0.75rem', verticalAlign: 'middle' }}>Admin</span>}
                        </h1>
                        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
                            {isAdmin
                                ? "Here's an overview of all volunteer activity"
                                : "Here's an overview of your volunteer contributions"
                            }
                        </p>
                    </div>

                    {/* Admin Stats Section */}
                    {isAdmin && adminStats && userStats && (
                        <>
                            {/* Admin Overview Stats */}
                            <div style={{ marginBottom: '2rem' }}>
                                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>
                                    📊 Organization Overview
                                </h2>
                                <div className="grid grid-cols-4">
                                    <StatCard
                                        value={userStats.total_users}
                                        label="Total Volunteers"
                                        icon={<Users size={28} />}
                                    />
                                    <StatCard
                                        value={adminStats.this_week.total_submitted}
                                        label="Submitted This Week"
                                        icon={<FileText size={28} />}
                                    />
                                    <StatCard
                                        value={adminStats.this_week.total_hours.toFixed(1)}
                                        label="Hours This Week"
                                        icon={<Clock size={28} />}
                                    />
                                    <StatCard
                                        value={adminStats.this_week.blockers_count}
                                        label="Blockers Reported"
                                        icon={<AlertCircle size={28} />}
                                    />
                                </div>
                            </div>

                            {/* Admin Quick Stats Row */}
                            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                                <div style={{
                                    background: 'var(--color-info-bg)',
                                    padding: '1rem',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-info)' }}>
                                        {userStats.active_users}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Active Users</div>
                                </div>
                                <div style={{
                                    background: 'var(--color-warning-bg)',
                                    padding: '1rem',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                                        {adminStats.this_week.total_drafts}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Drafts Pending</div>
                                </div>
                                <div style={{
                                    background: 'var(--color-success-bg)',
                                    padding: '1rem',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                                        {adminStats.all_time.total_submissions}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>All-Time Submissions</div>
                                </div>
                                <div style={{
                                    background: userStats.inactive_users > 0 ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
                                    padding: '1rem',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{
                                        fontSize: '1.5rem',
                                        fontWeight: 700,
                                        color: userStats.inactive_users > 0 ? 'var(--color-error)' : 'var(--color-success)'
                                    }}>
                                        {userStats.inactive_users}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Inactive Users</div>
                                </div>
                            </div>

                            {/* All Recent Submissions (Admin View) */}
                            <Card style={{ marginBottom: '2rem' }}>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle>📋 Recent Volunteer Submissions</CardTitle>
                                        <Link to="/admin/submissions">
                                            <Button variant="primary" size="sm">View All Submissions</Button>
                                        </Link>
                                    </div>
                                </CardHeader>

                                {isLoading ? (
                                    <LoadingSpinner size={30} />
                                ) : allSubmissions.length > 0 ? (
                                    <div className="table-wrapper">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Volunteer</th>
                                                    <th>Week</th>
                                                    <th>Hours</th>
                                                    <th>Status</th>
                                                    <th>Blockers</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {allSubmissions.map((sub) => (
                                                    <tr key={sub.id}>
                                                        <td><strong>{sub.user_name}</strong></td>
                                                        <td>{sub.week_id}</td>
                                                        <td>{sub.total_hours.toFixed(1)}h</td>
                                                        <td>
                                                            <Badge variant={sub.status as 'draft' | 'submitted' | 'reviewed'}>
                                                                {sub.status}
                                                            </Badge>
                                                            {sub.is_late && (
                                                                <span style={{ marginLeft: '0.35rem', fontSize: '0.65rem', color: 'var(--color-warning)', fontWeight: 600 }}>LATE</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {sub.has_blockers ? (
                                                                <span style={{ color: 'var(--color-error)' }}>⚠️ Yes</span>
                                                            ) : (
                                                                <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <Link to={`/submissions/${sub.id}`}>
                                                                <Button variant="ghost" size="sm">View</Button>
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
                                        title="No Submissions Yet"
                                        description="No volunteers have submitted updates yet."
                                    />
                                )}
                            </Card>

                            {/* Admin Quick Links */}
                            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                                <Link to="/admin/users" style={{ textDecoration: 'none' }}>
                                    <Card style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
                                        <div className="flex items-center gap-4">
                                            <div style={{
                                                width: 50,
                                                height: 50,
                                                background: 'var(--color-primary-gold)',
                                                borderRadius: 'var(--radius-md)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white'
                                            }}>
                                                <Users size={24} />
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Manage Users</h3>
                                                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                                    View all volunteers, change roles, manage access
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                                <Link to="/admin/submissions" style={{ textDecoration: 'none' }}>
                                    <Card style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
                                        <div className="flex items-center gap-4">
                                            <div style={{
                                                width: 50,
                                                height: 50,
                                                background: 'var(--color-primary-gold)',
                                                borderRadius: 'var(--radius-md)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white'
                                            }}>
                                                <FileText size={24} />
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>All Submissions</h3>
                                                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                                    View, filter, and review all volunteer submissions
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                                <Card
                                    style={{ cursor: reminderSending ? 'wait' : 'pointer', transition: 'transform 0.2s', opacity: reminderSending ? 0.7 : 1 }}
                                    onClick={reminderSending ? undefined : handleSendReminders}
                                >
                                    <div className="flex items-center gap-4">
                                        <div style={{
                                            width: 50,
                                            height: 50,
                                            background: 'var(--color-primary-gold)',
                                            borderRadius: 'var(--radius-md)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white'
                                        }}>
                                            <Mail size={24} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                                                {reminderSending ? 'Sending...' : 'Send Reminders'}
                                            </h3>
                                            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                                {reminderResult || 'Email volunteers who haven\'t submitted'}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </>
                    )}

                    {/* Personal Stats Grid (shown to everyone) */}
                    <div style={{ marginBottom: '1rem' }}>
                        {isAdmin && (
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>
                                👤 Your Personal Stats
                            </h2>
                        )}
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                        <StatCard value={user?.total_hours.toFixed(1) || '0'} label="Total Hours" icon={<Clock size={28} />} />
                        <StatCard value={user?.total_submissions || 0} label="Submissions" icon={<FileText size={28} />} />
                        <StatCard value={`${user?.submission_streak || 0}w`} label="Streak 🔥" icon={<Flame size={28} />} />
                        <StatCard value={weekInfo?.week_id || '--'} label="Current Week" icon={<Calendar size={28} />} />
                        <StatCard
                            value={weekInfo?.has_submission ? '✓' : '—'}
                            label="This Week"
                            icon={weekInfo?.has_submission ? <CheckCircle size={28} /> : <PlusCircle size={28} />}
                        />
                    </div>

                    {/* Hours Trend Chart */}
                    {hoursTrend.length > 0 && (() => {
                        const maxHours = Math.max(...hoursTrend.map(p => p.total_hours), 1);
                        return (
                            <Card style={{ marginBottom: '1.5rem' }}>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <BarChart3 size={20} />
                                            Hours Trend
                                        </CardTitle>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Last {hoursTrend.length} weeks</span>
                                    </div>
                                </CardHeader>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 120, padding: '0 0.5rem' }}>
                                    {hoursTrend.map((point) => {
                                        const pct = maxHours > 0 ? (point.total_hours / maxHours) * 100 : 0;
                                        const isCurrentWeek = point.week_id === weekInfo?.week_id;
                                        return (
                                            <div
                                                key={point.week_id}
                                                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}
                                                title={`${point.week_id}: ${point.total_hours.toFixed(1)}h${point.submitted ? '' : ' (not submitted)'}`}
                                            >
                                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: point.total_hours > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                                    {point.total_hours > 0 ? `${point.total_hours.toFixed(1)}` : ''}
                                                </span>
                                                <div style={{
                                                    width: '100%',
                                                    maxWidth: 48,
                                                    height: `${Math.max(pct, 4)}%`,
                                                    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                                                    background: isCurrentWeek
                                                        ? 'var(--color-primary-gold)'
                                                        : point.submitted
                                                            ? 'var(--color-success)'
                                                            : point.total_hours > 0
                                                                ? 'var(--color-warning)'
                                                                : 'var(--color-border)',
                                                    transition: 'height 0.4s ease',
                                                    opacity: point.total_hours > 0 ? 1 : 0.4,
                                                }} />
                                                <span style={{
                                                    fontSize: '0.6rem',
                                                    color: isCurrentWeek ? 'var(--color-primary-gold)' : 'var(--color-text-muted)',
                                                    fontWeight: isCurrentWeek ? 700 : 400,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    W{point.week_id.split('-W')[1]}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.75rem', paddingBottom: '0.25rem' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-success)', display: 'inline-block' }} /> Submitted
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-primary-gold)', display: 'inline-block' }} /> This Week
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-warning)', display: 'inline-block' }} /> Draft
                                    </span>
                                </div>
                            </Card>
                        );
                    })()}

                    {/* Weekly Attendance Grid */}
                    {attendance && attendance.grid.length > 0 && (
                        <Card style={{ marginBottom: '1.5rem' }}>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <CalendarCheck size={20} />
                                        Weekly Check-in History
                                    </CardTitle>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                        {attendance.attendance_rate}% attendance ({attendance.submitted_weeks}/{attendance.total_weeks - 1} weeks)
                                    </span>
                                </div>
                            </CardHeader>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', padding: '0 0.5rem 0.75rem' }}>
                                {attendance.grid.map((cell) => {
                                    const colors: Record<string, string> = {
                                        reviewed: 'var(--color-success)',
                                        submitted: '#3b82f6',
                                        draft: 'var(--color-warning)',
                                        none: 'var(--color-border)',
                                    };
                                    return (
                                        <div
                                            key={cell.week_id}
                                            title={`${cell.week_id}: ${cell.status === 'none' ? 'No submission' : `${cell.status} (${cell.total_hours.toFixed(1)}h)`}`}
                                            style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: 'var(--radius-sm)',
                                                background: colors[cell.status] || colors.none,
                                                opacity: cell.status === 'none' ? 0.3 : 1,
                                                border: cell.is_current ? '2px solid var(--color-primary-gold)' : '1px solid transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.55rem',
                                                fontWeight: 600,
                                                color: cell.status === 'none' ? 'var(--color-text-muted)' : 'white',
                                                cursor: 'default',
                                                transition: 'transform 0.15s ease',
                                            }}
                                        >
                                            {cell.week_id.split('-W')[1]}
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', paddingBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-success)', display: 'inline-block' }} /> Reviewed
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6', display: 'inline-block' }} /> Submitted
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-warning)', display: 'inline-block' }} /> Draft
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-border)', display: 'inline-block', opacity: 0.4 }} /> Missed
                                </span>
                            </div>
                        </Card>
                    )}

                    <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                        {/* Current Week Card */}
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>This Week's Update</CardTitle>
                                    {weekInfo?.has_submission && (
                                        <Badge variant={weekInfo.submission_status as 'draft' | 'submitted' | 'reviewed'}>
                                            {weekInfo.submission_status}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>

                            {isLoading ? (
                                <LoadingSpinner size={30} />
                            ) : weekInfo ? (
                                <div>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                                            Week: <strong>{weekInfo.week_id}</strong>
                                        </p>
                                        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
                                            {format(parseISO(weekInfo.week_start), 'MMM d')} - {format(parseISO(weekInfo.week_end), 'MMM d, yyyy')}
                                        </p>
                                    </div>

                                    <div style={{
                                        background: 'var(--color-info-bg)',
                                        padding: '1rem',
                                        borderRadius: 'var(--radius-md)',
                                        marginBottom: '1.5rem',
                                    }}>
                                        {weekInfo.submission_deadline && !isPast(parseISO(weekInfo.submission_deadline)) ? (() => {
                                            const deadline = parseISO(weekInfo.submission_deadline);
                                            const hoursLeft = differenceInHours(deadline, new Date());
                                            const daysLeft = differenceInDays(deadline, new Date());
                                            const isUrgent = hoursLeft < 24;
                                            return (
                                                <div className="flex items-center gap-3">
                                                    <Timer size={20} style={{ color: isUrgent ? 'var(--color-warning)' : 'var(--color-info)', flexShrink: 0 }} />
                                                    <div>
                                                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: isUrgent ? 'var(--color-warning)' : 'var(--color-info)' }}>
                                                            {isUrgent
                                                                ? `⏰ ${hoursLeft}h left to submit!`
                                                                : `📅 ${daysLeft}d ${hoursLeft % 24}h until deadline`
                                                            }
                                                        </p>
                                                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                            Due: {format(deadline, 'EEEE, MMM d · h:mm a')}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })() : (
                                            <p style={{ color: 'var(--color-info)', margin: 0, fontWeight: 500 }}>
                                                💡 You can submit your update anytime. Track your past, present, and future work!
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex gap-3">
                                        {weekInfo.has_submission ? (
                                            <Link to={`/submissions/${weekInfo.submission_id}`}>
                                                <Button variant="secondary">
                                                    <Edit size={18} />
                                                    View/Edit Submission
                                                </Button>
                                            </Link>
                                        ) : (
                                            <Link to="/submissions/new">
                                                <Button variant="primary">
                                                    <PlusCircle size={18} />
                                                    Start This Week's Update
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p>Unable to load week information</p>
                            )}
                        </Card>

                        {/* Quick Actions */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Quick Actions</CardTitle>
                            </CardHeader>

                            <div className="flex flex-col gap-3">
                                <Link to="/submissions/new" style={{ width: '100%' }}>
                                    <Button variant="primary" className="w-full">
                                        <PlusCircle size={18} />
                                        New Submission
                                    </Button>
                                </Link>
                                <Link to="/submissions" style={{ width: '100%' }}>
                                    <Button variant="secondary" className="w-full">
                                        <FileText size={18} />
                                        View History
                                    </Button>
                                </Link>
                            </div>
                        </Card>
                    </div>

                    {/* Recent Submissions */}
                    <Card style={{ marginTop: '1.5rem' }}>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Your Recent Submissions</CardTitle>
                                <Link to="/submissions">
                                    <Button variant="ghost" size="sm">View All →</Button>
                                </Link>
                            </div>
                        </CardHeader>

                        {isLoading ? (
                            <LoadingSpinner size={30} />
                        ) : recentSubmissions.length > 0 ? (
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Week</th>
                                            <th>Hours</th>
                                            <th>Status</th>
                                            <th>Submitted</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentSubmissions.map((sub) => (
                                            <tr key={sub.id}>
                                                <td><strong>{sub.week_id}</strong></td>
                                                <td>{sub.total_hours.toFixed(1)}h</td>
                                                <td>
                                                    <Badge variant={sub.status as 'draft' | 'submitted' | 'reviewed'}>
                                                        {sub.status}
                                                    </Badge>
                                                    {sub.is_late && (
                                                        <span style={{ marginLeft: '0.35rem', fontSize: '0.65rem', color: 'var(--color-warning)', fontWeight: 600 }}>LATE</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {sub.submitted_at ? format(parseISO(sub.submitted_at), 'MMM d, yyyy') : '—'}
                                                </td>
                                                <td>
                                                    <Link to={`/submissions/${sub.id}`}>
                                                        <Button variant="ghost" size="sm">View</Button>
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
                                title="No Submissions Yet"
                                description="Start tracking your volunteer work by creating your first submission."
                                action={
                                    <Link to="/submissions/new">
                                        <Button variant="primary">Create First Submission</Button>
                                    </Link>
                                }
                            />
                        )}
                    </Card>
                </div>
            </main>
            <Footer />
        </div>
    );
}
