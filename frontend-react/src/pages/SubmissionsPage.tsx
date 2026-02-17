import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import type { SubmissionSummary } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Badge, LoadingSpinner, EmptyState } from '../components/ui';
import { FileText, Plus, Calendar, Clock, AlertTriangle, Eye } from 'lucide-react';
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
            <main className="main-content">
                <div className="container">
                    <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
                        <div>
                            <h1 style={{ marginBottom: '0.5rem' }}>My Submissions</h1>
                            <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Your complete submission history</p>
                        </div>
                        <Link to="/submissions/new">
                            <Button variant="primary">
                                <Plus size={18} />
                                New Submission
                            </Button>
                        </Link>
                    </div>

                    <div className="grid grid-cols-3" style={{ marginBottom: '2rem' }}>
                        <div className="stat-card">
                            <div className="stat-value">{submissions.length}</div>
                            <div className="stat-label">Total Submissions</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{totalHours.toFixed(1)}h</div>
                            <div className="stat-label">Total Hours</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{submissions.filter(s => s.status !== 'draft').length}</div>
                            <div className="stat-label">Submitted</div>
                        </div>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Submission History</CardTitle>
                        </CardHeader>

                        {isLoading ? (
                            <LoadingSpinner size={40} />
                        ) : submissions.length > 0 ? (
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th><Calendar size={14} style={{ display: 'inline', marginRight: '0.5rem' }} />Week</th>
                                            <th><Clock size={14} style={{ display: 'inline', marginRight: '0.5rem' }} />Hours</th>
                                            <th>Status</th>
                                            <th>Blockers</th>
                                            <th>Submitted</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {submissions.map((sub) => (
                                            <tr key={sub.id}>
                                                <td><strong style={{ color: 'var(--color-primary-gold)' }}>{sub.week_id}</strong></td>
                                                <td>{sub.total_hours.toFixed(1)}h</td>
                                                <td><Badge variant={sub.status as 'draft' | 'submitted' | 'reviewed'}>{sub.status}</Badge></td>
                                                <td>
                                                    {sub.has_blockers ? (
                                                        <span className="flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
                                                            <AlertTriangle size={14} /> Yes
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td>{sub.submitted_at ? format(parseISO(sub.submitted_at), 'MMM d, yyyy') : '—'}</td>
                                                <td>
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
