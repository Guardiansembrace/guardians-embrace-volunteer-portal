import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
    AlertCircle,
    CheckCircle,
    ChevronLeft,
    Clock,
    Eye,
    FileText,
    RefreshCw,
    Search,
    ListFilter
} from 'lucide-react';
import { Navbar, Footer } from '../components/Layout';
import { Badge, Button, EmptyState, LoadingSpinner } from '../components/ui';
import { api } from '../lib/api';
import type { Submission, SubmissionSummary } from '../lib/api';
import { useAuth } from '../lib/useAuth';

type QueueView = 'needs-review' | 'blockers' | 'drafts' | 'reviewed' | 'all';

export default function AdminSubmissionsPage() {
    const navigate = useNavigate();
    const { canAccessAdminPortal, hasAdminScope, isDelegatedAdmin, isLoading: authLoading, isAuthenticated } = useAuth();
    const volunteerSearchId = useId();
    const weekFilterId = useId();
    const statusFilterId = useId();
    const adminNotesId = useId();

    const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [weekFilter, setWeekFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [volunteerSearch, setVolunteerSearch] = useState('');
    const [activeView, setActiveView] = useState<QueueView>(() => {
        if (typeof window === 'undefined') {
            return 'needs-review';
        }
        const savedView = window.localStorage.getItem('admin-submissions-view');
        if (savedView === 'needs-review' || savedView === 'blockers' || savedView === 'drafts' || savedView === 'reviewed' || savedView === 'all') {
            return savedView;
        }
        return 'needs-review';
    });
    const [viewingSubmission, setViewingSubmission] = useState<Submission | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [adminNotes, setAdminNotes] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !canAccessAdminPortal || !hasAdminScope('review_submissions'))) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, canAccessAdminPortal, hasAdminScope, navigate]);

    useEffect(() => {
        if (isAuthenticated && canAccessAdminPortal && hasAdminScope('review_submissions')) {
            void loadSubmissions();
        }
    }, [isAuthenticated, canAccessAdminPortal, hasAdminScope]);

    useEffect(() => {
        window.localStorage.setItem('admin-submissions-view', activeView);
    }, [activeView]);

    const loadSubmissions = async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const data = await api.getAllSubmissions({ limit: 200 });
            setSubmissions(data);
        } catch (err) {
            console.error('Failed to load submissions:', err);
            setLoadError(err instanceof Error ? err.message : 'Unable to load the submissions queue right now.');
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

    const attentionCounts = {
        needsReview: submissions.filter((sub) => sub.status === 'submitted').length,
        blockers: submissions.filter((sub) => sub.has_blockers).length,
        drafts: submissions.filter((sub) => sub.status === 'draft').length,
        reviewed: submissions.filter((sub) => sub.status === 'reviewed').length,
    };

    const filteredSubmissions = submissions.filter((submission) => {
        const matchesVolunteer = !volunteerSearch || submission.user_name.toLowerCase().includes(volunteerSearch.toLowerCase());
        const matchesWeek = !weekFilter || submission.week_id === weekFilter;
        const matchesStatus = !statusFilter || submission.status === statusFilter;
        const matchesView = activeView === 'all'
            || (activeView === 'needs-review' && submission.status === 'submitted')
            || (activeView === 'blockers' && submission.has_blockers)
            || (activeView === 'drafts' && submission.status === 'draft')
            || (activeView === 'reviewed' && submission.status === 'reviewed');

        return matchesVolunteer && matchesWeek && matchesStatus && matchesView;
    });

    const uniqueWeeks = [...new Set(submissions.map((submission) => submission.week_id))].sort().reverse();
    const hasActiveFilters = Boolean(volunteerSearch || weekFilter || statusFilter || activeView !== 'needs-review');

    const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
        const priority = (submission: SubmissionSummary) => {
            if (submission.status === 'submitted' && submission.has_blockers) return 0;
            if (submission.status === 'submitted') return 1;
            if (submission.status === 'draft' && submission.has_blockers) return 2;
            if (submission.status === 'draft') return 3;
            if (submission.has_blockers) return 4;
            if (submission.status === 'reviewed') return 5;
            return 6;
        };

        const priorityDiff = priority(a) - priority(b);
        if (priorityDiff !== 0) {
            return priorityDiff;
        }

        const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
        const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
        return dateB - dateA;
    });

    const hasLoadedSubmissions = submissions.length > 0;
    const hasFilteredResults = sortedSubmissions.length > 0;

    let emptyStateTitle = 'Queue is clear';
    let emptyStateDescription = 'No volunteer submissions have been created yet. Once updates start coming in, they will appear here for review.';
    let emptyStateAction = (
        <Button variant="secondary" onClick={() => navigate('/admin')}>
            Back to Dashboard
        </Button>
    );

    if (loadError && !hasLoadedSubmissions) {
        emptyStateTitle = 'Could not load submissions';
        emptyStateDescription = loadError;
        emptyStateAction = (
            <Button variant="primary" onClick={loadSubmissions}>
                <RefreshCw size={16} /> Try again
            </Button>
        );
    } else if (hasLoadedSubmissions && !hasFilteredResults) {
        emptyStateTitle = 'No submissions match these filters';
        emptyStateDescription = 'Try another review view, search term, or status filter to widen the queue.';
        emptyStateAction = (
            <Button
                variant="secondary"
                onClick={() => {
                    setVolunteerSearch('');
                    setWeekFilter('');
                    setStatusFilter('');
                    setActiveView('needs-review');
                }}
            >
                Clear Filters
            </Button>
        );
    }

    if (authLoading || !isAuthenticated || !canAccessAdminPortal || !hasAdminScope('review_submissions')) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)' }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    return (
        <div className="page-wrapper" style={{ background: 'var(--color-bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <main id="main-content" className="main-content" style={{ flex: 1 }}>
                <div className="container" style={{ padding: '2.5rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '2.5rem' }}>
                        <button 
                            onClick={() => navigate('/admin')} 
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', padding: 0 }}
                            className="hover-opacity"
                        >
                            <ChevronLeft size={16} /> Back to Dashboard
                        </button>
                        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#334155' }}>
                                <FileText size={28} />
                            </div>
                            All Submissions
                        </h1>
                        <p style={{ color: '#64748b', margin: 0, fontSize: '1.05rem', maxWidth: '600px' }}>
                            {isDelegatedAdmin
                                ? 'Review volunteer submissions through your delegated admin workspace.'
                                : 'Manage the complete queue of volunteer updates and track organizational health.'}
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                        <AdminMetric
                            title="Needs Review"
                            value={attentionCounts.needsReview}
                            icon={<FileText size={22} />}
                            tone={attentionCounts.needsReview > 0 ? 'warning' : 'default'}
                            subtext={attentionCounts.needsReview > 0 ? 'Waiting on admin review' : 'No pending reviews'}
                        />
                        <AdminMetric
                            title="Reported Blockers"
                            value={attentionCounts.blockers}
                            icon={<AlertCircle size={22} />}
                            tone={attentionCounts.blockers > 0 ? 'danger' : 'success'}
                            subtext={attentionCounts.blockers > 0 ? 'Urgent follow-up required' : 'No blockers active'}
                        />
                        <AdminMetric
                            title="Drafts Open"
                            value={attentionCounts.drafts}
                            icon={<Clock size={22} />}
                            tone="default"
                            subtext={attentionCounts.drafts > 0 ? 'In-progress updates' : 'No drafts open'}
                        />
                    </div>

                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', padding: '1.5rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }} className="hide-scrollbars">
                                {[
                                    { id: 'needs-review' as QueueView, label: 'Needs Review', count: attentionCounts.needsReview },
                                    { id: 'blockers' as QueueView, label: 'Blockers', count: attentionCounts.blockers },
                                    { id: 'drafts' as QueueView, label: 'Drafts', count: attentionCounts.drafts },
                                    { id: 'reviewed' as QueueView, label: 'Reviewed', count: attentionCounts.reviewed },
                                    { id: 'all' as QueueView, label: 'All', count: submissions.length },
                                ].map((view) => (
                                    <button
                                        key={view.id}
                                        type="button"
                                        style={{
                                            border: 'none',
                                            background: activeView === view.id ? '#0f172a' : '#f1f5f9',
                                            color: activeView === view.id ? 'white' : '#475569',
                                            padding: '0.5rem 1rem',
                                            borderRadius: '999px',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            transition: 'all 0.2s ease',
                                            whiteSpace: 'nowrap'
                                        }}
                                        onClick={() => setActiveView(view.id)}
                                    >
                                        {view.label}
                                        <span style={{ 
                                            background: activeView === view.id ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)', 
                                            padding: '0.1rem 0.4rem', 
                                            borderRadius: '999px', 
                                            fontSize: '0.75rem' 
                                        }}>
                                            {view.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)} style={{ color: showFilters ? 'var(--color-primary-gold)' : '#64748b' }}>
                                    <ListFilter size={16} style={{ marginRight: '0.4rem' }} /> Filters
                                </Button>
                                <Button variant="ghost" size="sm" onClick={loadSubmissions}>
                                    <RefreshCw size={16} />
                                </Button>
                            </div>
                        </div>

                        {showFilters && (
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '1.25rem', background: '#f8fafc', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #e2e8f0', animation: 'slideDown 0.3s ease-out' }}>
                                <div style={{ flex: '1 1 250px' }}>
                                    <label className="form-label" htmlFor={volunteerSearchId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Search Volunteer</label>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input
                                            id={volunteerSearchId}
                                            type="text"
                                            className="form-input"
                                            placeholder="Find by name..."
                                            value={volunteerSearch}
                                            onChange={(e) => setVolunteerSearch(e.target.value)}
                                            style={{ paddingLeft: '2.5rem', background: 'white' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ minWidth: '150px' }}>
                                    <label className="form-label" htmlFor={weekFilterId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Filter by Week</label>
                                    <select id={weekFilterId} className="form-select" value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} style={{ background: 'white' }}>
                                        <option value="">All Weeks</option>
                                        {uniqueWeeks.map((week) => <option key={week} value={week}>{week}</option>)}
                                    </select>
                                </div>
                                <div style={{ minWidth: '150px' }}>
                                    <label className="form-label" htmlFor={statusFilterId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Filter by Status</label>
                                    <select id={statusFilterId} className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ background: 'white' }}>
                                        <option value="">All Statuses</option>
                                        <option value="draft">Draft</option>
                                        <option value="submitted">Submitted</option>
                                        <option value="reviewed">Reviewed</option>
                                    </select>
                                </div>
                                {hasActiveFilters && (
                                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                        <Button variant="ghost" onClick={() => { setVolunteerSearch(''); setWeekFilter(''); setStatusFilter(''); setActiveView('needs-review'); }}>
                                            Clear All
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {loadError && hasLoadedSubmissions && (
                            <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', border: '1px solid #fecaca' }}>
                                Refresh failed: {loadError} Showing the most recent loaded queue instead.
                            </div>
                        )}

                        {isLoading ? (
                            <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
                                <LoadingSpinner size={32} />
                            </div>
                        ) : hasFilteredResults ? (
                            <div className="table-wrapper" style={{ margin: '0 -1.5rem -1.5rem', borderRadius: '0 0 16px 16px' }}>
                                <table className="table" style={{ margin: 0 }}>
                                    <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <tr>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Volunteer</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Week</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Hours</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Status</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Blockers</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Submitted</th>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedSubmissions.map((submission) => (
                                            <tr key={submission.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s', cursor: 'default' }} className="hover:bg-slate-50">
                                                <td style={{ padding: '1rem 1.5rem' }}>
                                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{submission.user_name}</span>
                                                </td>
                                                <td style={{ padding: '1rem', color: '#475569', fontSize: '0.9rem' }}>{submission.week_id}</td>
                                                <td style={{ padding: '1rem', color: '#475569', fontWeight: 600 }}>{submission.total_hours.toFixed(1)}h</td>
                                                <td style={{ padding: '1rem' }}>
                                                    <Badge variant={submission.status as 'draft' | 'submitted' | 'reviewed'}>
                                                        {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                                                    </Badge>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    {submission.has_blockers ? (
                                                        <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#fef2f2', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                                                            <AlertCircle size={14} /> Yes
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>None</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '1rem', fontSize: '0.9rem', color: '#64748b' }}>
                                                    {submission.submitted_at ? format(parseISO(submission.submitted_at), 'MMM d, yyyy') : '—'}
                                                </td>
                                                <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>
                                                    <Button
                                                        variant={submission.status === 'submitted' ? 'secondary' : 'ghost'}
                                                        size="sm"
                                                        onClick={() => viewSubmissionDetail(submission.id)}
                                                        disabled={loadingDetail}
                                                        style={{ borderRadius: '8px' }}
                                                    >
                                                        <Eye size={16} style={{ marginRight: '0.4rem' }} />
                                                        {submission.status === 'submitted' ? 'Review' : 'View'}
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ padding: '2rem' }}>
                                <EmptyState
                                    icon={<FileText size={48} />}
                                    title={emptyStateTitle}
                                    description={emptyStateDescription}
                                    action={emptyStateAction}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Submission Detail Modal */}
                {viewingSubmission && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15, 23, 42, 0.6)',
                            backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1000, padding: '1.5rem',
                            animation: 'fadeIn 0.2s ease-out'
                        }}
                        onClick={() => setViewingSubmission(null)}
                    >
                        <div
                            style={{
                                maxWidth: '800px', width: '100%', maxHeight: '90vh',
                                background: 'white', borderRadius: '20px',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                                display: 'flex', flexDirection: 'column',
                                overflow: 'hidden',
                                animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                        >
                            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                                    Submission: <span style={{ color: 'var(--color-primary-gold)' }}>{viewingSubmission.user_name}</span>
                                </h3>
                                <button onClick={() => setViewingSubmission(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>Close</button>
                            </div>

                            <div style={{ padding: '2rem', overflowY: 'auto', flex: 1 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem', background: '#f1f5f9', padding: '1.25rem', borderRadius: '12px' }}>
                                    <div>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>Week</p>
                                        <p style={{ margin: '0.25rem 0 0', fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>{viewingSubmission.week_id}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>Hours</p>
                                        <p style={{ margin: '0.25rem 0 0', fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>{viewingSubmission.total_hours}h</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>Status</p>
                                        <div style={{ marginTop: '0.25rem' }}>
                                            <Badge variant={viewingSubmission.status as 'draft' | 'submitted' | 'reviewed'}>
                                                {viewingSubmission.status.charAt(0).toUpperCase() + viewingSubmission.status.slice(1)}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                {/* Content Sections */}
                                {viewingSubmission.blockers && (
                                    <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '1.25rem', borderRadius: '0 12px 12px 0', marginBottom: '2rem' }}>
                                        <h4 style={{ margin: '0 0 0.5rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
                                            <AlertCircle size={18} /> Reported Blockers
                                        </h4>
                                        <p style={{ margin: 0, color: '#7f1d1d', lineHeight: 1.6 }}>{viewingSubmission.blockers}</p>
                                    </div>
                                )}

                                {viewingSubmission.past_work.length > 0 && (
                                    <div style={{ marginBottom: '2rem' }}>
                                        <h4 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Work Completed</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {viewingSubmission.past_work.map((entry, i) => (
                                            <div key={i} style={{ background: 'white', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                <p style={{ margin: 0, color: '#334155', lineHeight: 1.5 }}>{entry.description}</p>
                                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.85rem' }}>
                                                    <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}><Clock size={14} /> {entry.hours}h</span>
                                                    {entry.drive_link && <a href={entry.drive_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-gold)', fontWeight: 600 }}>External Link →</a>}
                                                </div>
                                            </div>
                                        ))}
                                        </div>
                                    </div>
                                )}

                                {viewingSubmission.status !== 'draft' && (
                                    <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
                                        <label htmlFor={adminNotesId} style={{ display: 'block', marginBottom: '0.75rem', color: '#0f172a', fontWeight: 800, fontSize: '1.1rem' }}>
                                            {isDelegatedAdmin ? 'Review Notes' : 'Admin Notes'}
                                        </label>
                                        <textarea
                                            id={adminNotesId}
                                            className="form-textarea"
                                            placeholder="Leave feedback or notes before marking as reviewed..."
                                            value={adminNotes}
                                            onChange={(e) => setAdminNotes(e.target.value)}
                                            rows={3}
                                            style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1rem' }}
                                        />
                                    </div>
                                )}
                            </div>
                            
                            <div style={{ padding: '1.5rem 2rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <Button variant="ghost" onClick={() => setViewingSubmission(null)}>Cancel</Button>
                                {viewingSubmission.status === 'submitted' && (
                                    <Button variant="primary" onClick={handleReview} disabled={reviewing} isLoading={reviewing}>
                                        <CheckCircle size={18} style={{ marginRight: '0.5rem' }} /> Mark as Reviewed
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
}

// ── Shared Metric Component ────────────────────────────────────────────────────────

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
