import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import type { SubmissionSummary, Submission } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Badge, LoadingSpinner, EmptyState } from '../components/ui';
import { FileText, Search, Clock, AlertCircle, ChevronLeft, Eye, CheckCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function AdminSubmissionsPage() {
    const navigate = useNavigate();
    const { isAdmin, isLoading: authLoading, isAuthenticated } = useAuth();

    const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [weekFilter, setWeekFilter] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [volunteerSearch, setVolunteerSearch] = useState('');
    const [viewingSubmission, setViewingSubmission] = useState<Submission | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [adminNotes, setAdminNotes] = useState('');

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !isAdmin)) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, isAdmin, navigate]);

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            loadSubmissions();
        }
    }, [isAuthenticated, isAdmin, weekFilter, statusFilter]);

    const loadSubmissions = async () => {
        try {
            setIsLoading(true);
            const params: Record<string, string | number | undefined> = { limit: 100 };
            if (weekFilter) params.week_id = weekFilter;
            if (statusFilter) params.status = statusFilter;

            const data = await api.getAllSubmissions(params);
            setSubmissions(data);
        } catch (err) {
            console.error('Failed to load submissions:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const viewSubmissionDetail = async (submissionId: string) => {
        try {
            setLoadingDetail(true);
            const detail = await api.getSubmission(submissionId);
            setViewingSubmission(detail);
            setAdminNotes(detail.admin_notes || '');
        } catch (err) {
            console.error('Failed to load submission detail:', err);
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleReview = async () => {
        if (!viewingSubmission) return;
        try {
            setReviewing(true);
            await api.reviewSubmission(viewingSubmission.id, adminNotes);
            await loadSubmissions();
            setViewingSubmission(null);
        } catch (err) {
            console.error('Failed to review submission:', err);
            alert('Failed to mark as reviewed');
        } finally {
            setReviewing(false);
        }
    };

    // Filter by volunteer name
    const filteredSubmissions = submissions.filter(sub => {
        if (!volunteerSearch) return true;
        return sub.user_name.toLowerCase().includes(volunteerSearch.toLowerCase());
    });

    // Get unique weeks for filter
    const uniqueWeeks = [...new Set(submissions.map(s => s.week_id))].sort().reverse();

    if (authLoading || !isAuthenticated || !isAdmin) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    return (
        <div className="page-wrapper">
            <Navbar />
            <main className="main-content">
                <div className="container">
                    {/* Header */}
                    <div style={{ marginBottom: '2rem' }}>
                        <Button variant="ghost" onClick={() => navigate('/dashboard')} style={{ marginBottom: '1rem' }}>
                            <ChevronLeft size={18} />
                            Back to Dashboard
                        </Button>
                        <h1 style={{ marginBottom: '0.5rem' }}>
                            <FileText size={32} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                            All Submissions
                        </h1>
                        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
                            View, filter, and review all volunteer submissions
                        </p>
                    </div>

                    {/* Filters */}
                    <Card style={{ marginBottom: '1.5rem' }}>
                        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
                            {/* Volunteer Search */}
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <label className="form-label">Search Volunteer</label>
                                <div style={{ position: 'relative' }}>
                                    <Search size={18} style={{
                                        position: 'absolute',
                                        left: '0.75rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--color-text-muted)'
                                    }} />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Search by volunteer name..."
                                        value={volunteerSearch}
                                        onChange={(e) => setVolunteerSearch(e.target.value)}
                                        style={{ paddingLeft: '2.5rem' }}
                                    />
                                </div>
                            </div>

                            {/* Week Filter */}
                            <div style={{ minWidth: '150px' }}>
                                <label className="form-label">Week</label>
                                <select
                                    className="form-select"
                                    value={weekFilter}
                                    onChange={(e) => setWeekFilter(e.target.value)}
                                >
                                    <option value="">All Weeks</option>
                                    {uniqueWeeks.map(week => (
                                        <option key={week} value={week}>{week}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Filter */}
                            <div style={{ minWidth: '150px' }}>
                                <label className="form-label">Status</label>
                                <select
                                    className="form-select"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                >
                                    <option value="">All Status</option>
                                    <option value="draft">Draft</option>
                                    <option value="submitted">Submitted</option>
                                    <option value="reviewed">Reviewed</option>
                                </select>
                            </div>
                        </div>
                    </Card>

                    {/* Submission Detail Modal */}
                    {viewingSubmission && (
                        <div style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            padding: '2rem',
                        }}>
                            <Card style={{
                                maxWidth: '800px',
                                width: '100%',
                                maxHeight: '90vh',
                                overflow: 'auto',
                                background: 'white'
                            }}>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle>
                                            Submission: {viewingSubmission.user_name}
                                        </CardTitle>
                                        <Button variant="ghost" onClick={() => setViewingSubmission(null)}>✕</Button>
                                    </div>
                                </CardHeader>

                                <div style={{ padding: '1rem 0' }}>
                                    {/* Submission Info */}
                                    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Week</span>
                                            <p style={{ margin: 0, fontWeight: 600 }}>{viewingSubmission.week_id}</p>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Total Hours</span>
                                            <p style={{ margin: 0, fontWeight: 600 }}>{viewingSubmission.total_hours}h</p>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Status</span>
                                            <p style={{ margin: 0 }}>
                                                <Badge variant={viewingSubmission.status as 'draft' | 'submitted' | 'reviewed'}>
                                                    {viewingSubmission.status}
                                                </Badge>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Work Sections */}
                                    {viewingSubmission.past_work.length > 0 && (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                                                Past Work (Completed)
                                            </h4>
                                            {viewingSubmission.past_work.map((entry, i) => (
                                                <div key={i} style={{
                                                    background: 'var(--color-bg-secondary)',
                                                    padding: '0.75rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    marginBottom: '0.5rem'
                                                }}>
                                                    <p style={{ margin: 0 }}>{entry.description}</p>
                                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                                        <span><Clock size={14} /> {entry.hours}h</span>
                                                        {entry.drive_link && (
                                                            <a href={entry.drive_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-gold)' }}>
                                                                View Drive Link
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {viewingSubmission.present_work.length > 0 && (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                                                Present Work (In Progress)
                                            </h4>
                                            {viewingSubmission.present_work.map((entry, i) => (
                                                <div key={i} style={{
                                                    background: 'var(--color-info-bg)',
                                                    padding: '0.75rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    marginBottom: '0.5rem'
                                                }}>
                                                    <p style={{ margin: 0 }}>{entry.description}</p>
                                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                                        <span><Clock size={14} /> {entry.hours}h</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {viewingSubmission.future_work.length > 0 && (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                                                Future Work (Planned)
                                            </h4>
                                            {viewingSubmission.future_work.map((entry, i) => (
                                                <div key={i} style={{
                                                    background: 'var(--color-warning-bg)',
                                                    padding: '0.75rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    marginBottom: '0.5rem'
                                                }}>
                                                    <p style={{ margin: 0 }}>{entry.description}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Blockers */}
                                    {viewingSubmission.blockers && (
                                        <div style={{
                                            background: 'var(--color-error-bg)',
                                            padding: '1rem',
                                            borderRadius: 'var(--radius-md)',
                                            marginBottom: '1.5rem'
                                        }}>
                                            <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-error)' }}>
                                                <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                                                Blockers
                                            </h4>
                                            <p style={{ margin: 0 }}>{viewingSubmission.blockers}</p>
                                        </div>
                                    )}

                                    {/* Notes */}
                                    {viewingSubmission.notes && (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>Notes</h4>
                                            <p style={{ margin: 0 }}>{viewingSubmission.notes}</p>
                                        </div>
                                    )}

                                    {/* Admin Notes (for review) */}
                                    {viewingSubmission.status !== 'draft' && (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                                                Admin Notes
                                            </h4>
                                            <textarea
                                                className="form-textarea"
                                                placeholder="Add notes for this submission..."
                                                value={adminNotes}
                                                onChange={(e) => setAdminNotes(e.target.value)}
                                                rows={3}
                                            />
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-3 justify-between">
                                        <Button variant="secondary" onClick={() => setViewingSubmission(null)}>
                                            Close
                                        </Button>
                                        {viewingSubmission.status === 'submitted' && (
                                            <Button
                                                variant="primary"
                                                onClick={handleReview}
                                                disabled={reviewing}
                                                isLoading={reviewing}
                                            >
                                                <CheckCircle size={18} />
                                                Mark as Reviewed
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* Submissions Table */}
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Submissions ({filteredSubmissions.length})</CardTitle>
                                <Button variant="ghost" size="sm" onClick={loadSubmissions}>
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>

                        {isLoading ? (
                            <LoadingSpinner size={40} />
                        ) : filteredSubmissions.length > 0 ? (
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Volunteer</th>
                                            <th>Week</th>
                                            <th>Hours</th>
                                            <th>Status</th>
                                            <th>Blockers</th>
                                            <th>Submitted</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSubmissions.map((sub) => (
                                            <tr key={sub.id}>
                                                <td><strong>{sub.user_name}</strong></td>
                                                <td>{sub.week_id}</td>
                                                <td>{sub.total_hours.toFixed(1)}h</td>
                                                <td>
                                                    <Badge variant={sub.status as 'draft' | 'submitted' | 'reviewed'}>
                                                        {sub.status}
                                                    </Badge>
                                                </td>
                                                <td>
                                                    {sub.has_blockers ? (
                                                        <span style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <AlertCircle size={16} /> Yes
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ fontSize: '0.875rem' }}>
                                                    {sub.submitted_at
                                                        ? format(parseISO(sub.submitted_at), 'MMM d, yyyy')
                                                        : '—'
                                                    }
                                                </td>
                                                <td>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => viewSubmissionDetail(sub.id)}
                                                            disabled={loadingDetail}
                                                        >
                                                            <Eye size={16} />
                                                            View
                                                        </Button>
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
                                title="No Submissions Found"
                                description="No submissions match your current filters."
                            />
                        )}
                    </Card>
                </div>
            </main>
            <Footer />
        </div>
    );
}
