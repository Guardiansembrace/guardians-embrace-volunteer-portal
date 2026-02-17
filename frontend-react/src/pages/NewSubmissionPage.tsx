import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import type { WeekInfo, WorkEntry, Submission, FileInfo } from '../lib/api';
import FileUpload from '../components/FileUpload';
import CommentSection from '../components/CommentSection';

import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Input, Textarea, LoadingSpinner } from '../components/ui';
import { ArrowLeft, Plus, Trash2, Save, Send, Link as LinkIcon, Clock, CheckCircle, Edit3, Download, FileText, ExternalLink, Tag, Zap } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface FormEntry {
    id: string;
    description: string;
    hours: number;
    drive_link: string;
    tags: string[];
}

const createEntry = (): FormEntry => ({
    id: Math.random().toString(36).substr(2, 9),
    description: '',
    hours: 0,
    drive_link: '',
    tags: [],
});

const workEntryToFormEntry = (entry: WorkEntry): FormEntry => ({
    id: Math.random().toString(36).substr(2, 9),
    description: entry.description,
    hours: entry.hours || 0,
    drive_link: entry.drive_link || '',
    tags: entry.tags || [],
});

export default function NewSubmissionPage() {
    const navigate = useNavigate();
    const { id: submissionId } = useParams<{ id: string }>();
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();

    const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [pastWork, setPastWork] = useState<FormEntry[]>([createEntry()]);
    const [presentWork, setPresentWork] = useState<FormEntry[]>([createEntry()]);
    const [futureWork, setFutureWork] = useState<FormEntry[]>([createEntry()]);
    const [blockers, setBlockers] = useState('');
    const [notes, setNotes] = useState('');
    const [moodRating, setMoodRating] = useState<number | null>(null);
    const [quickMode, setQuickMode] = useState(false);
    const [quickSummary, setQuickSummary] = useState('');
    const [quickHours, setQuickHours] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(!!submissionId);

    // View vs Edit mode
    const [isEditing, setIsEditing] = useState(!submissionId); // new submissions start in edit mode

    // Work categories
    const [categories, setCategories] = useState<string[]>([]);
    // Carry-forward from last week
    const [lastWeekGoals, setLastWeekGoals] = useState<{ goals: WorkEntry[]; from_week: string } | null>(null);
    const [goalsApplied, setGoalsApplied] = useState(false);

    // Files from Drive
    const [driveFiles, setDriveFiles] = useState<FileInfo[]>([]);
    const [filesLoading, setFilesLoading] = useState(false);

    // Check if within edit window (7 days from account creation)
    const canEdit = (() => {
        if (!user) return false;
        if (user.role === 'admin' || user.role === 'team_lead') return true;
        if (!user.file_access_expires) return true; // no expiry set = unlimited
        return new Date(user.file_access_expires) > new Date();
    })();

    // Check if submission is editable (draft or submitted within window)
    const canEditSubmission = canEdit && (!submission || submission.status !== 'reviewed');

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate('/login');
        }
    }, [authLoading, isAuthenticated, navigate]);

    // Load week info, categories, and last week goals
    useEffect(() => {
        if (isAuthenticated) {
            api.getCurrentWeekInfo().then(setWeekInfo).catch(console.error);
            api.getWorkCategories().then(setCategories).catch(console.error);
            // Only fetch carry-forward goals for new submissions
            if (!submissionId) {
                api.getLastWeekGoals().then(setLastWeekGoals).catch(console.error);
            }
        }
    }, [isAuthenticated, submissionId]);

    // Load existing submission if viewing
    useEffect(() => {
        if (isAuthenticated && submissionId) {
            setIsLoading(true);
            api.getSubmission(submissionId)
                .then((sub) => {
                    setSubmission(sub);
                    setPastWork(sub.past_work.length > 0 ? sub.past_work.map(workEntryToFormEntry) : [createEntry()]);
                    setPresentWork(sub.present_work.length > 0 ? sub.present_work.map(workEntryToFormEntry) : [createEntry()]);
                    setFutureWork(sub.future_work.length > 0 ? sub.future_work.map(workEntryToFormEntry) : [createEntry()]);
                    setBlockers(sub.blockers || '');
                    setNotes(sub.notes || '');
                    setMoodRating(sub.mood_rating ?? null);
                })
                .catch((err) => setError(err.message))
                .finally(() => setIsLoading(false));
        }
    }, [isAuthenticated, submissionId]);

    // Load files from Drive for the current week
    useEffect(() => {
        if (isAuthenticated && (weekInfo || submission)) {
            const targetWeek = submission?.week_id || weekInfo?.week_id;
            if (targetWeek) {
                setFilesLoading(true);
                api.listFiles({ week_id: targetWeek })
                    .then(setDriveFiles)
                    .catch(() => setDriveFiles([]))
                    .finally(() => setFilesLoading(false));
            }
        }
    }, [isAuthenticated, weekInfo, submission]);

    const calculateTotalHours = () => {
        const past = pastWork.reduce((sum, e) => sum + (e.hours || 0), 0);
        const present = presentWork.reduce((sum, e) => sum + (e.hours || 0), 0);
        return past + present;
    };

    const handleEntryChange = (
        id: string,
        field: keyof FormEntry,
        value: string | number,
        setter: React.Dispatch<React.SetStateAction<FormEntry[]>>
    ) => {
        setter(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const prepareEntries = (entries: FormEntry[]): WorkEntry[] => {
        return entries
            .filter(e => e.description.trim())
            .map(e => ({
                description: e.description,
                hours: e.hours || 0,
                drive_link: e.drive_link || undefined,
                tags: e.tags || [],
            }));
    };

    const handleSaveDraft = async () => {
        setIsSubmitting(true);
        setError(null);
        setSaveSuccess(false);
        try {
            const payload = quickMode
                ? {
                    past_work: quickSummary.trim() ? [{ description: quickSummary, hours: quickHours || 0 }] : [],
                    present_work: [] as WorkEntry[],
                    future_work: [] as WorkEntry[],
                    blockers: blockers || undefined,
                    notes: notes || undefined,
                }
                : {
                    past_work: prepareEntries(pastWork),
                    present_work: prepareEntries(presentWork),
                    future_work: prepareEntries(futureWork),
                    blockers: blockers || undefined,
                    notes: notes || undefined,
                };
            const result = await api.createOrUpdateSubmission(payload);
            setSubmission(result);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = quickMode
                ? {
                    past_work: quickSummary.trim() ? [{ description: quickSummary, hours: quickHours || 0 }] : [],
                    present_work: [] as WorkEntry[],
                    future_work: [] as WorkEntry[],
                    blockers: blockers || undefined,
                    notes: notes || undefined,
                    mood_rating: moodRating ?? undefined,
                }
                : {
                    past_work: prepareEntries(pastWork),
                    present_work: prepareEntries(presentWork),
                    future_work: prepareEntries(futureWork),
                    blockers: blockers || undefined,
                    notes: notes || undefined,
                    mood_rating: moodRating ?? undefined,
                };
            const sub = await api.createOrUpdateSubmission(payload);
            await api.submitSubmission(sub.id);
            navigate('/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownload = async (file: FileInfo) => {
        try {
            const blob = await api.downloadFile(file.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Download failed');
        }
    };

    const handleDeleteFile = async (file: FileInfo) => {
        if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
        try {
            await api.deleteFile(file.id);
            setDriveFiles(prev => prev.filter(f => f.id !== file.id));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        }
    };

    const refreshFiles = () => {
        const targetWeek = submission?.week_id || weekInfo?.week_id;
        if (targetWeek) {
            api.listFiles({ week_id: targetWeek })
                .then(setDriveFiles)
                .catch(() => {});
        }
    };

    if (authLoading || isLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    const displayWeekId = submission?.week_id || weekInfo?.week_id || '';
    const displayDateRange = submission
        ? `${format(parseISO(submission.week_start), 'MMM d')} - ${format(parseISO(submission.week_end), 'MMM d, yyyy')}`
        : weekInfo
            ? `${format(parseISO(weekInfo.week_start), 'MMM d')} - ${format(parseISO(weekInfo.week_end), 'MMM d, yyyy')}`
            : '';

    return (
        <div className="page-wrapper">
            <Navbar />
            <main className="main-content">
                <div className="container" style={{ maxWidth: '900px' }}>
                    {/* Header */}
                    <div style={{ marginBottom: '2rem' }}>
                        <Link to="/dashboard" className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                            <ArrowLeft size={16} /> Back to Dashboard
                        </Link>

                        <div className="flex justify-between items-center">
                            <div>
                                <h1 style={{ marginBottom: '0.5rem' }}>
                                    {isEditing ? 'Weekly Update' : 'Submission Details'}
                                </h1>
                                <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
                                    {displayWeekId} • {displayDateRange}
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {/* Edit button — only in view mode, only if editable */}
                                {!isEditing && canEditSubmission && (
                                    <Button variant="secondary" onClick={() => setIsEditing(true)}>
                                        <Edit3 size={16} /> Edit
                                    </Button>
                                )}
                                <div className="stat-card" style={{ padding: '1rem 1.5rem' }}>
                                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                                        {submission
                                            ? `${submission.total_hours.toFixed(1)}h`
                                            : quickMode
                                                ? `${(quickHours || 0).toFixed(1)}h`
                                                : `${calculateTotalHours().toFixed(1)}h`
                                        }
                                    </div>
                                    <div className="stat-label">Total Hours</div>
                                </div>
                            </div>
                        </div>

                        {/* Status badge for existing submissions */}
                        {submission && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <span style={{
                                    display: 'inline-block',
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '1rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    background: submission.status === 'submitted' ? '#dbeafe' :
                                        submission.status === 'reviewed' ? '#dcfce7' : '#f3f4f6',
                                    color: submission.status === 'submitted' ? '#1d4ed8' :
                                        submission.status === 'reviewed' ? '#15803d' : '#6b7280',
                                }}>
                                    {submission.status}
                                </span>
                                {!canEditSubmission && submission.status === 'reviewed' && (
                                    <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                        This submission has been reviewed and cannot be edited.
                                    </span>
                                )}
                                {!canEdit && (
                                    <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: 'var(--color-error)' }}>
                                        Your edit window has expired. Contact an admin.
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                            {error}
                        </div>
                    )}

                    {saveSuccess && (
                        <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }} className="flex items-center gap-2">
                            <CheckCircle size={18} /> Draft saved successfully!
                        </div>
                    )}

                    {/* ── Carry-Forward Goals Banner ──────────────── */}
                    {isEditing && !submissionId && lastWeekGoals && lastWeekGoals.goals.length > 0 && !goalsApplied && (
                        <div style={{
                            background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
                            border: '1px solid var(--color-primary-gold)',
                            padding: '1rem 1.25rem',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: '1.5rem',
                        }}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>
                                        🎯 You had {lastWeekGoals.goals.length} planned goal{lastWeekGoals.goals.length > 1 ? 's' : ''} from {lastWeekGoals.from_week}
                                    </p>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                        {lastWeekGoals.goals.map(g => g.description).join(' • ')}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="primary" size="sm" onClick={() => {
                                        const carried = lastWeekGoals.goals.map(g => ({
                                            id: Math.random().toString(36).substr(2, 9),
                                            description: g.description,
                                            hours: 0,
                                            drive_link: g.drive_link || '',
                                            tags: g.tags || [],
                                        }));
                                        setPastWork(prev => {
                                            const hasContent = prev.some(e => e.description.trim());
                                            return hasContent ? [...prev, ...carried] : carried;
                                        });
                                        setGoalsApplied(true);
                                    }}>
                                        Add to Past Work
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setGoalsApplied(true)} style={{ color: 'var(--color-text-muted)' }}>
                                        Dismiss
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Files Section ─────────────────────────── */}
                    <Card style={{ marginBottom: '1.5rem' }}>
                        <CardHeader>
                            <CardTitle>📁 Files & Attachments</CardTitle>
                        </CardHeader>
                        <div style={{ padding: '0 1rem 1rem' }}>
                            {/* Upload form — only in edit mode */}
                            {isEditing && (
                                <>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                        Upload reports, timesheets, or other documents to Google Drive.
                                    </p>
                                    <FileUpload
                                        weekId={submission?.week_id || weekInfo?.week_id}
                                        onFileUploaded={() => refreshFiles()}
                                    />
                                </>
                            )}

                            {/* File list — always visible */}
                            {filesLoading ? (
                                <div style={{ textAlign: 'center', padding: '1rem' }}>
                                    <LoadingSpinner size={24} />
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>Loading files...</p>
                                </div>
                            ) : driveFiles.length > 0 ? (
                                <div style={{ marginTop: isEditing ? '1.5rem' : '0' }}>
                                    <h4 style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        {isEditing ? 'Previously Uploaded Files' : 'Uploaded Files'} ({driveFiles.length})
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {driveFiles.map((file) => (
                                            <div
                                                key={file.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    padding: '0.75rem',
                                                    background: 'var(--color-bg-secondary)',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: '1px solid var(--color-border)',
                                                }}
                                            >
                                                <FileText size={20} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />

                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{
                                                        margin: 0,
                                                        fontSize: '0.875rem',
                                                        fontWeight: 500,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {file.name}
                                                    </p>
                                                    {file.size && (
                                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                            {formatFileSize(parseInt(file.size))}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                                    {file.web_link && (
                                                        <a
                                                            href={file.web_link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title="Open in Drive"
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                width: '32px',
                                                                height: '32px',
                                                                borderRadius: 'var(--radius-md)',
                                                                color: 'var(--color-primary-gold)',
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            <ExternalLink size={16} />
                                                        </a>
                                                    )}
                                                    <button
                                                        onClick={() => handleDownload(file)}
                                                        title="Download"
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: 'var(--radius-md)',
                                                            color: 'var(--color-text-secondary)',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <Download size={16} />
                                                    </button>
                                                    {isEditing && (
                                                        <button
                                                            onClick={() => handleDeleteFile(file)}
                                                            title="Delete"
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                width: '32px',
                                                                height: '32px',
                                                                borderRadius: 'var(--radius-md)',
                                                                color: 'var(--color-error)',
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                !isEditing && (
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                                        No files uploaded for this week.
                                    </p>
                                )
                            )}
                        </div>
                    </Card>

                    {/* ── Quick Check-in Toggle ──────────────────── */}
                    {isEditing && !submissionId && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                            background: quickMode ? 'linear-gradient(135deg, #FEF3C7, #FDE68A)' : 'var(--color-bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            border: quickMode ? '1px solid var(--color-primary-gold)' : '1px solid var(--color-border)',
                            marginBottom: '1.5rem',
                            transition: 'all 0.2s ease',
                        }}>
                            <div className="flex items-center gap-2">
                                <Zap size={18} style={{ color: quickMode ? 'var(--color-primary-gold)' : 'var(--color-text-muted)' }} />
                                <div>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem' }}>Quick Check-in</p>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                        Just log total hours &amp; a summary — skip the detailed breakdown
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setQuickMode(!quickMode)}
                                style={{
                                    width: 44,
                                    height: 24,
                                    borderRadius: 12,
                                    border: 'none',
                                    background: quickMode ? 'var(--color-primary-gold)' : 'var(--color-border)',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s ease',
                                    flexShrink: 0,
                                }}
                            >
                                <span style={{
                                    position: 'absolute',
                                    top: 2,
                                    left: quickMode ? 22 : 2,
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    background: 'white',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    transition: 'left 0.2s ease',
                                }} />
                            </button>
                        </div>
                    )}

                    {/* ── Quick Check-in Form ─────────────────────── */}
                    {isEditing && quickMode && (
                        <Card style={{ marginBottom: '1.5rem' }}>
                            <CardHeader>
                                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Zap size={18} style={{ color: 'var(--color-primary-gold)' }} /> Quick Summary
                                </CardTitle>
                            </CardHeader>
                            <div style={{ padding: '0 1rem 1rem' }}>
                                <div className="flex gap-3" style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <Textarea
                                            label="What did you work on this week?"
                                            placeholder="Brief summary of your volunteer work..."
                                            value={quickSummary}
                                            onChange={(e) => setQuickSummary(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Clock size={18} style={{ color: 'var(--color-text-muted)' }} />
                                    <div style={{ width: 140 }}>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            placeholder="Total hours"
                                            value={quickHours || ''}
                                            onChange={(e) => setQuickHours(parseFloat(e.target.value) || 0)}
                                            className="form-input"
                                            style={{ padding: '0.5rem', fontSize: '1rem', fontWeight: 600 }}
                                        />
                                    </div>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>hours this week</span>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* ── Work Sections (hidden in quick mode) ──── */}
                    {!quickMode && (
                        <>
                    <Card style={{ marginBottom: '1.5rem' }}>
                        <CardHeader><CardTitle>📋 Past Work (What was done)</CardTitle></CardHeader>
                        {isEditing ? (
                            <WorkEntryList entries={pastWork} setEntries={setPastWork} showHours onChange={handleEntryChange} categories={categories} />
                        ) : (
                            <ReadOnlyEntries entries={pastWork} showHours />
                        )}
                    </Card>

                    <Card style={{ marginBottom: '1.5rem' }}>
                        <CardHeader><CardTitle>🔄 Present Work (In progress)</CardTitle></CardHeader>
                        {isEditing ? (
                            <WorkEntryList entries={presentWork} setEntries={setPresentWork} showHours onChange={handleEntryChange} categories={categories} />
                        ) : (
                            <ReadOnlyEntries entries={presentWork} showHours />
                        )}
                    </Card>

                    <Card style={{ marginBottom: '1.5rem' }}>
                        <CardHeader><CardTitle>🎯 Future Work (Planned)</CardTitle></CardHeader>
                        {isEditing ? (
                            <WorkEntryList entries={futureWork} setEntries={setFutureWork} showHours={false} onChange={handleEntryChange} categories={categories} />
                        ) : (
                            <ReadOnlyEntries entries={futureWork} showHours={false} />
                        )}
                    </Card>
                        </>
                    )}

                    <Card style={{ marginBottom: '1.5rem' }}>
                        <CardHeader><CardTitle>📝 Additional Notes</CardTitle></CardHeader>
                        {isEditing ? (
                            <>
                                <Textarea label="Blockers (if any)" placeholder="Any obstacles?" value={blockers} onChange={(e) => setBlockers(e.target.value)} />
                                <Textarea label="Notes" placeholder="Any other notes?" value={notes} onChange={(e) => setNotes(e.target.value)} />
                            </>
                        ) : (
                            <div style={{ padding: '0 1rem 1rem' }}>
                                {blockers ? (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Blockers</p>
                                        <p style={{ margin: 0, fontSize: '0.9rem' }}>{blockers}</p>
                                    </div>
                                ) : null}
                                {notes ? (
                                    <div>
                                        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Notes</p>
                                        <p style={{ margin: 0, fontSize: '0.9rem' }}>{notes}</p>
                                    </div>
                                ) : null}
                                {!blockers && !notes && (
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>No additional notes.</p>
                                )}
                            </div>
                        )}
                    </Card>

                    {/* ── Mood Rating ─────────────────────────── */}
                    <Card style={{ marginBottom: '1.5rem' }}>
                        <CardHeader><CardTitle>😊 How was your week?</CardTitle></CardHeader>
                        <div style={{ padding: '0 1rem 1rem' }}>
                            {isEditing ? (
                                <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                                        Rate your overall experience this week
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                        {[
                                            { value: 1, emoji: '😞', label: 'Tough' },
                                            { value: 2, emoji: '😐', label: 'Meh' },
                                            { value: 3, emoji: '🙂', label: 'Okay' },
                                            { value: 4, emoji: '😊', label: 'Good' },
                                            { value: 5, emoji: '🤩', label: 'Great' },
                                        ].map(({ value, emoji, label }) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setMoodRating(moodRating === value ? null : value)}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    padding: '0.75rem 1rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: moodRating === value ? '2px solid var(--color-primary-gold)' : '1px solid var(--color-border)',
                                                    background: moodRating === value ? 'var(--color-primary-gold-light, #F5E6B8)' : 'transparent',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    minWidth: '60px',
                                                }}
                                            >
                                                <span style={{ fontSize: '1.5rem' }}>{emoji}</span>
                                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                                    {moodRating ? (
                                        <span style={{ fontSize: '2rem' }}>
                                            {['😞', '😐', '🙂', '😊', '🤩'][moodRating - 1]}
                                        </span>
                                    ) : (
                                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No mood recorded.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* ── Comments ─────────────────────────────── */}
                    {submission && (
                        <Card style={{ marginBottom: '1.5rem' }}>
                            <CardHeader><CardTitle>💬 Discussion</CardTitle></CardHeader>
                            <div style={{ padding: '0 1rem 1rem' }}>
                                <CommentSection submissionId={submission.id} />
                            </div>
                        </Card>
                    )}

                    {/* ── Action Buttons ─────────────────────────── */}
                    {isEditing && (
                        <div className="flex justify-between" style={{ padding: '1.5rem', background: 'white', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
                            <Button variant="ghost" onClick={() => submissionId ? setIsEditing(false) : navigate('/dashboard')} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <div className="flex gap-3">
                                <Button variant="secondary" onClick={handleSaveDraft} disabled={isSubmitting} isLoading={isSubmitting}>
                                    <Save size={18} /> Save Draft
                                </Button>
                                <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting} isLoading={isSubmitting}>
                                    <Send size={18} /> Submit for Review
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}

// ── Read-Only Entries ───────────────────────────────────────────────────

function ReadOnlyEntries({ entries, showHours }: { entries: FormEntry[]; showHours: boolean }) {
    const filledEntries = entries.filter(e => e.description.trim());

    if (filledEntries.length === 0) {
        return (
            <div style={{ padding: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No entries.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '0 1rem 1rem' }}>
            {filledEntries.map((entry) => (
                <div
                    key={entry.id}
                    style={{
                        padding: '0.75rem 1rem',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>{entry.description}</p>
                        {entry.tags && entry.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                                {entry.tags.map((tag) => (
                                    <span key={tag} style={{
                                        fontSize: '0.65rem',
                                        padding: '0.1rem 0.45rem',
                                        borderRadius: '1rem',
                                        background: 'var(--color-primary-gold-light, #F5E6B8)',
                                        color: 'var(--color-text-secondary)',
                                        fontWeight: 500,
                                    }}>{tag}</span>
                                ))}
                            </div>
                        )}
                        {entry.drive_link && (
                            <a
                                href={entry.drive_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '0.75rem', color: 'var(--color-primary-gold)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}
                            >
                                <LinkIcon size={12} /> Drive Link <ExternalLink size={10} />
                            </a>
                        )}
                    </div>
                    {showHours && entry.hours > 0 && (
                        <span style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--color-text-secondary)',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                        }}>
                            <Clock size={14} /> {entry.hours}h
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Editable Work Entry List ────────────────────────────────────────────

function WorkEntryList({
    entries,
    setEntries,
    showHours,
    onChange,
    categories = [],
}: {
    entries: FormEntry[];
    setEntries: React.Dispatch<React.SetStateAction<FormEntry[]>>;
    showHours: boolean;
    onChange: (id: string, field: keyof FormEntry, value: string | number, setter: React.Dispatch<React.SetStateAction<FormEntry[]>>) => void;
    categories?: string[];
}) {
    const toggleTag = (entryId: string, tag: string) => {
        setEntries(prev => prev.map(e => {
            if (e.id !== entryId) return e;
            const has = e.tags.includes(tag);
            return { ...e, tags: has ? e.tags.filter(t => t !== tag) : [...e.tags, tag] };
        }));
    };

    return (
        <div>
            {entries.map((entry) => (
                <div key={entry.id} style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem' }}>
                    <div className="flex gap-3" style={{ marginBottom: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                            <Input placeholder="Describe what you worked on..." value={entry.description} onChange={(e) => onChange(entry.id, 'description', e.target.value, setEntries)} />
                        </div>
                        {showHours && (
                            <div style={{ width: '120px' }} className="flex items-center gap-2">
                                <Clock size={16} style={{ color: 'var(--color-text-muted)' }} />
                                <input type="number" min="0" step="0.5" placeholder="Hours" value={entry.hours || ''} onChange={(e) => onChange(entry.id, 'hours', parseFloat(e.target.value) || 0, setEntries)} className="form-input" style={{ padding: '0.5rem' }} />
                            </div>
                        )}
                        {entries.length > 1 && (
                            <Button variant="ghost" onClick={() => setEntries(prev => prev.filter(e => e.id !== entry.id))} style={{ padding: '0.5rem', color: 'var(--color-error)' }}>
                                <Trash2 size={18} />
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <LinkIcon size={16} style={{ color: 'var(--color-text-muted)' }} />
                        <input type="url" placeholder="Google Drive link (optional)" value={entry.drive_link} onChange={(e) => onChange(entry.id, 'drive_link', e.target.value, setEntries)} className="form-input" style={{ padding: '0.5rem', fontSize: '0.875rem' }} />
                    </div>
                    {/* Category Tags */}
                    {categories.length > 0 && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <Tag size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                            {categories.map((cat) => {
                                const isSelected = entry.tags.includes(cat);
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => toggleTag(entry.id, cat)}
                                        style={{
                                            fontSize: '0.7rem',
                                            padding: '0.15rem 0.5rem',
                                            borderRadius: '1rem',
                                            border: isSelected ? '1.5px solid var(--color-primary-gold)' : '1px solid var(--color-border)',
                                            background: isSelected ? 'var(--color-primary-gold-light, #F5E6B8)' : 'transparent',
                                            color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                            fontWeight: isSelected ? 600 : 400,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
            <Button variant="ghost" onClick={() => setEntries(prev => [...prev, createEntry()])} style={{ width: '100%', marginTop: '0.5rem' }}>
                <Plus size={18} /> Add Entry
            </Button>
        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
