import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import type { SubmissionSummary } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Badge, GuidancePanel, LoadingSpinner, EmptyState, InfoTooltip } from '../components/ui';
import { FileText, Plus, Calendar, AlertTriangle, Eye, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const DELETE_WINDOW_DAYS = 7;

function isDeletable(sub: SubmissionSummary): boolean {
    if (sub.status === 'reviewed') return false;
    if (sub.status === 'submitted' && sub.submitted_at) {
        const age = (Date.now() - new Date(sub.submitted_at).getTime()) / (1000 * 60 * 60 * 24);
        if (age > DELETE_WINDOW_DAYS) return false;
    }
    return true;
}

export default function SubmissionsPage() {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading: authLoading, refreshUser } = useAuth();
    const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate('/login');
        }
    }, [authLoading, isAuthenticated, navigate]);

    useEffect(() => {
        if (isAuthenticated) {
            loadSubmissions();
        }
    }, [isAuthenticated]);

    const handleDelete = async (sub: SubmissionSummary) => {
        const label = sub.status === 'submitted' ? 'submitted' : 'draft';
        if (!window.confirm(`Delete this ${label} submission for ${sub.week_id}? This cannot be undone.`)) return;
        setDeletingId(sub.id);
        try {
            await api.deleteSubmission(sub.id);
            await refreshUser();
            setSubmissions(prev => prev.filter(s => s.id !== sub.id));
        } catch (err) {
            window.alert(err instanceof Error ? err.message : 'Failed to delete submission.');
        } finally {
            setDeletingId(null);
        }
    };

    const loadSubmissions = async () => {
        try {
            const data = await api.getMySubmissions();
            setSubmissions(data);
        } catch (err) {
            console.error('Failed to load submissions:', err);
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

    const totalHours = submissions.reduce((sum, s) => sum + (s.reported_hours ?? s.total_hours), 0);

    return (
        <div className="page-wrapper">
            <Navbar />
            <main id="main-content" className="main-content">
                <div className="container">
                    <div className="flex-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--color-text-primary)' }}>My Submissions</h1>
                            <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '0.9rem' }}>Review your reported hours and status.</p>
                        </div>
                        <Link to="/submissions/new" style={{ textDecoration: 'none' }}>
                            <Button variant="primary">
                                <Plus size={18} style={{ marginRight: '0.5rem' }} />
                                New or Missed Week
                            </Button>
                        </Link>
                    </div>

                    <GuidancePanel
                        title="Help & Guidelines"
                        description="Submission tracking instructions:"
                        items={[
                            'Draft means you saved progress but have not sent the update for review yet.',
                            'Submitted means the weekly update is ready for a reviewer to look at.',
                            'Reviewed means that week has been finalized unless an admin reopens it.',
                            'Use New or Missed Week when you need to backfill a recent week you did not submit on time.',
                            'Hours shown here are the reported hours saved on each submission. Open a submission to compare reported and credited hours.',
                        ]}
                        icon={<FileText size={16} />}
                        tone="slate"
                        style={{ marginBottom: '1.5rem' }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', display: 'flex', alignItems: 'center' }}>Total Submissions <InfoTooltip content="All your updates, including drafts" /></div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>{submissions.length}</div>
                        </div>
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', display: 'flex', alignItems: 'center' }}>Reported Hours <InfoTooltip content="Total hours you've logged" /></div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>{totalHours.toFixed(1)}<span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}>h</span></div>
                        </div>
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', display: 'flex', alignItems: 'center' }}>Submitted <InfoTooltip content="Updates sent for review" /></div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>{submissions.filter(s => s.status !== 'draft').length}</div>
                        </div>
                    </div>

                    <Card style={{ marginBottom: '2rem' }}>
                        <CardHeader>
                            <CardTitle>Submission History</CardTitle>
                        </CardHeader>

                        {isLoading ? (
                            <LoadingSpinner size={40} />
                        ) : submissions.length > 0 ? (
                            <div className="table-wrapper">
                                <table className="table">
                                    <caption className="sr-only">
                                        Your submission history with week, hours, status, blockers, submitted date, and a link to view each submission.
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col" style={{ display: 'flex', alignItems: 'center' }}><Calendar size={14} style={{ marginRight: '0.4rem' }} />Week</th>
                                            <th scope="col">Reported</th>
                                            <th scope="col">Status</th>
                                            <th scope="col" className="hidden-mobile">Blockers</th>
                                            <th scope="col" className="hidden-mobile">Submitted</th>
                                            <th scope="col" style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {submissions.map((sub) => (
                                            <tr key={sub.id}>
                                                <td><strong style={{ color: 'var(--color-primary-gold)' }}>{sub.week_id}</strong></td>
                                                <td>{(sub.reported_hours ?? sub.total_hours).toFixed(1)}h</td>
                                                <td><Badge variant={sub.status as 'draft' | 'submitted' | 'reviewed'}>{sub.status}</Badge></td>
                                                <td className="hidden-mobile">
                                                    {sub.has_blockers ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#b91c1c', fontSize: '0.85rem', fontWeight: 600, backgroundColor: '#fef2f2', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                                            <AlertTriangle size={14} /> Yes
                                                        </span>
                                                    ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                                                </td>
                                                <td className="hidden-mobile" style={{ color: 'var(--color-text-secondary)' }}>{sub.submitted_at ? format(parseISO(sub.submitted_at), 'MMM d, yyyy') : '—'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <Link to={`/submissions/${sub.id}`}>
                                                            <Button variant="ghost" size="sm"><Eye size={16} /> View</Button>
                                                        </Link>
                                                        {isDeletable(sub) && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                isLoading={deletingId === sub.id}
                                                                onClick={() => handleDelete(sub)}
                                                                style={{ color: '#ef4444' }}
                                                                title="Delete submission"
                                                            >
                                                                <Trash2 size={15} />
                                                            </Button>
                                                        )}
                                                    </div>
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
                                action={<Link to="/submissions/new"><Button variant="primary">Create First Submission</Button></Link>}
                            />
                        )}
                    </Card>
                </div>
            </main>
            <Footer />
        </div>
    );
}

