import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, Button, LoadingSpinner } from '../components/ui';
import {
    Users,
    FileText,
    Briefcase,
    Settings,
    Shield,
    Clock,
    AlertCircle,
    ChevronRight
} from 'lucide-react';

interface AdminStats {
    users: {
        total: number;
        active: number;
        volunteers: number;
    };
    submissions: {
        pending_review: number;
        this_week_hours: number;
        blockers: number;
    };
    projects: {
        active: number;
    };
}

export default function AdminDashboardPage() {
    const navigate = useNavigate();
    const { isAdmin, isLoading: authLoading, isAuthenticated } = useAuth();
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !isAdmin)) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, isAdmin, navigate]);

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            loadStats();
        }
    }, [isAuthenticated, isAdmin]);

    const loadStats = async () => {
        try {
            setIsLoading(true);
            const [userStats, subStats, projects] = await Promise.all([
                api.getUserStats(),
                api.getSubmissionStats(),
                api.getProjects('active')
            ]);

            setStats({
                users: {
                    total: userStats.total_users,
                    active: userStats.active_users,
                    volunteers: userStats.volunteers,
                },
                submissions: {
                    pending_review: subStats.this_week.total_submitted, // Simplified
                    this_week_hours: subStats.this_week.total_hours,
                    blockers: subStats.this_week.blockers_count,
                },
                projects: {
                    active: projects.length,
                }
            });
        } catch (err) {
            console.error('Failed to load admin stats:', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (authLoading || !isAuthenticated || !isAdmin) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner size={50} />
            </div>
        );
    }

    return (
        <div className="page-wrapper">
            <Navbar />
            <main className="main-content">
                <div className="container">
                    <div className="flex-between" style={{ marginBottom: '2rem' }}>
                        <div>
                            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Shield size={32} style={{ color: 'var(--color-primary-gold)' }} />
                                Admin Portal
                            </h1>
                            <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Overview and management tools for the organization.</p>
                        </div>
                        <Button variant="secondary" onClick={loadStats}>
                            Refresh Data
                        </Button>
                    </div>

                    {isLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
                            <LoadingSpinner size={40} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {/* Quick Stats Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '1.5rem' }}>
                                <StatCard
                                    title="Active Volunteers"
                                    value={stats?.users.active || 0}
                                    icon={<Users className="text-blue-500" />}
                                    trend="Total registered: "
                                    trendValue={stats?.users.total}
                                />
                                <StatCard
                                    title="Hours Logged (Week)"
                                    value={(stats?.submissions.this_week_hours || 0).toFixed(1)}
                                    icon={<Clock className="text-green-500" />}
                                    suffix="h"
                                />
                                <StatCard
                                    title="Active Projects"
                                    value={stats?.projects.active || 0}
                                    icon={<Briefcase className="text-purple-500" />}
                                />
                            </div>

                            {/* Management Sections */}
                            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '2rem' }}>
                                <ManagementCard
                                    title="User Management"
                                    description="Manage roles, permissions, and account status."
                                    icon={<Users size={24} />}
                                    action="Manage Users"
                                    onClick={() => navigate('/admin/users')}
                                    stats={`${stats?.users.volunteers} Volunteers`}
                                />
                                <ManagementCard
                                    title="Submission Review"
                                    description="Review weekly logs, hours, and blocker reports."
                                    icon={<FileText size={24} />}
                                    action="Review Submissions"
                                    onClick={() => navigate('/admin/submissions')}
                                    stats={`${stats?.submissions.pending_review} Pending Reviews`}
                                    alert={stats?.submissions.blockers ? `${stats.submissions.blockers} Blockers Reported` : undefined}
                                />
                                <ManagementCard
                                    title="Project Management"
                                    description="Create new projects, update status, and assign teams."
                                    icon={<Briefcase size={24} />}
                                    action="Manage Projects"
                                    onClick={() => navigate('/projects')}
                                    stats="Create & Edit Projects"
                                />
                                <ManagementCard
                                    title="System Settings"
                                    description="Configure application defaults and global settings."
                                    icon={<Settings size={24} />}
                                    action="Settings"
                                    onClick={() => navigate('/admin/settings')}
                                    stats="Dynamic Forms"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}

function StatCard({ title, value, icon, suffix = '', trend, trendValue }: any) {
    return (
        <Card className="flex-between" style={{ alignItems: 'flex-start' }}>
            <div>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 0.25rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
                <h3 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                    {value}<span style={{ fontSize: '1.25rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>{suffix}</span>
                </h3>
                {trend && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.5rem 0 0 0' }}>
                        {trend} <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{trendValue}</span>
                    </p>
                )}
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--color-background)', borderRadius: 'var(--radius-md)' }}>
                {icon}
            </div>
        </Card>
    );
}

function ManagementCard({ title, description, icon, action, onClick, stats, alert, disabled }: any) {
    return (
        <Card style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'default',
            padding: '2rem'
        }}>
            <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--color-background)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-secondary)' }}>
                    {icon}
                </div>
                {alert && (
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-error)', backgroundColor: 'var(--color-error-bg)', padding: '0.25rem 0.75rem', borderRadius: '999px' }}>
                        <AlertCircle size={14} style={{ marginRight: '0.25rem' }} />
                        {alert}
                    </div>
                )}
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>{title}</h3>
            <p style={{ color: 'var(--color-text-muted)', margin: '0 0 2rem 0', flex: 1, lineHeight: 1.6 }}>{description}</p>

            <div className="flex-between" style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {stats}
                </span>
                <Button
                    onClick={onClick}
                    disabled={disabled}
                    variant="ghost"
                    size="sm"
                    style={{ fontWeight: 600, color: 'var(--color-primary-gold)', margin: 0, padding: '0 0.5rem' }}
                >
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                        {action} <ChevronRight size={16} style={{ marginLeft: '0.25rem' }} />
                    </span>
                </Button>
            </div>
        </Card>
    );
}
