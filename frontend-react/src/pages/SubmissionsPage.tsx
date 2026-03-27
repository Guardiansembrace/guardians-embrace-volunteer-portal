import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import type { SubmissionSummary } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Badge, LoadingSpinner, EmptyState } from '../components/ui';
import { FileText, Plus, Calendar, AlertTriangle, Eye } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function SubmissionsPage() {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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

    const totalHours = submissions.reduce((sum, s) => sum + s.total_hours, 0);

    return (
        <div className="page-wrapper">
            <Navbar />
            <main id="main-content" className="main-content">
                <div className="container">
                    <div className="flex-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>My Submissions</h1>
                            <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Review your reported hours and status.</p>
                        </div>
                        <Link to="/submissions/new" style={{ textDecoration: 'none' }}>
                            <Button variant="primary">
                                <Plus size={18} style={{ marginRight: '0.5rem' }} />
                                New Submission
                            </Button>
                        </Link>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Total Submissions</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>{submissions.length}</div>
                        </div>
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Total Hours</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>{totalHours.toFixed(1)}<span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}>h</span></div>
                        </div>
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Submitted</div>
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
                                            <th scope="col">Hours</th>
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
                                                <td>{sub.total_hours.toFixed(1)}h</td>
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
                                                    <Link to={`/submissions/${sub.id}`}>
                                                        <Button variant="ghost" size="sm"><Eye size={16} /> View</Button>
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
