import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import type { WeekInfo, WorkEntry, Submission, FileInfo, AdminSettings, FormSection } from '../lib/api';
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

interface SubmissionAutosaveSnapshot {
    version: 1;
    savedAt: number;
    pastWork: FormEntry[];
    presentWork: FormEntry[];
    futureWork: FormEntry[];
    blockers: string;
    notes: string;
    moodRating: number | null;
    quickMode: boolean;
    quickSummary: string;
    quickHours: number;
    customResponses: Record<string, FormEntry[]>;
    goalsApplied: boolean;
}

type EntrySetter = React.Dispatch<React.SetStateAction<FormEntry[]>>;

const AUTOSAVE_VERSION = 1;
const AUTOSAVE_DELAY_MS = 1200;

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

    // Dynamic Form Capabilities
    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [customResponses, setCustomResponses] = useState<Record<string, FormEntry[]>>({});

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
    const [fileAccessNotice, setFileAccessNotice] = useState<string | null>(null);
    const [pendingRecovery, setPendingRecovery] = useState<SubmissionAutosaveSnapshot | null>(null);
    const [recoveryChecked, setRecoveryChecked] = useState(false);
    const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null);
    const [persistedSnapshot, setPersistedSnapshot] = useState<string | null>(null);

    const autosaveScope = submissionId
        ? `submission:${submissionId}`
        : weekInfo?.week_id
            ? `week:${weekInfo.week_id}`
            : null;
    const autosaveKey = user && autosaveScope
        ? `submission-autosave:${user.id}:${autosaveScope}`
        : null;

    // Check if within edit window (7 days from account creation)
    const canEdit = (() => {
        if (!user) return false;
        if (user.role === 'admin' || user.role === 'team_lead') return true;
        if (!user.file_access_expires) return true; // no expiry set = unlimited
        return new Date(user.file_access_expires) > new Date();
    })();

    // Check if submission is editable (draft or submitted within window)
    const canEditSubmission = canEdit && (!submission || submission.status !== 'reviewed');
    const targetWeekId = submission?.week_id || weekInfo?.week_id || '';
    const isCurrentWeekContext = Boolean(weekInfo?.week_id && targetWeekId === weekInfo.week_id);
    const submissionWindowStart = isCurrentWeekContext && weekInfo
        ? parseISO(weekInfo.submission_window_start)
        : null;
    const submissionDeadline = isCurrentWeekContext && weekInfo
        ? parseISO(weekInfo.submission_deadline)
        : null;
    const scheduleNow = new Date();
    const isBeforeSubmissionWindow = Boolean(
        isCurrentWeekContext
        && weekInfo
        && !weekInfo.is_submission_window_open
        && submissionWindowStart
        && scheduleNow < submissionWindowStart
    );
    const isClosedAfterDeadline = Boolean(
        isCurrentWeekContext
        && weekInfo
        && !weekInfo.is_submission_window_open
        && submissionDeadline
        && scheduleNow > submissionDeadline
        && !weekInfo.allow_late_submissions
    );
    const isLateSubmissionMode = Boolean(
        isCurrentWeekContext
        && weekInfo
        && !weekInfo.is_submission_window_open
        && submissionDeadline
        && scheduleNow > submissionDeadline
        && weekInfo.allow_late_submissions
    );
    const isSubmissionWindowLocked = isBeforeSubmissionWindow || isClosedAfterDeadline;
    const canPersistSubmission = canEditSubmission && !isSubmissionWindowLocked;

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate('/login');
        }
    }, [authLoading, isAuthenticated, navigate]);

    // Load week info, settings, and last week goals
    useEffect(() => {
        if (isAuthenticated) {
            api.getCurrentWeekInfo().then(setWeekInfo).catch(console.error);
            api.getSettings().then(s => {
                setSettings(s);
                setCategories(s.tags);
            }).catch(console.error);
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
                    const restoredPastWork = sub.past_work.length > 0 ? sub.past_work.map(workEntryToFormEntry) : [createEntry()];
                    const restoredPresentWork = sub.present_work.length > 0 ? sub.present_work.map(workEntryToFormEntry) : [createEntry()];
                    const restoredFutureWork = sub.future_work.length > 0 ? sub.future_work.map(workEntryToFormEntry) : [createEntry()];
                    const restoredCustomResponses = Object.fromEntries(
                        Object.entries(sub.custom_responses || {}).map(([k, v]) => [
                            k,
                            Array.isArray(v) ? (v as WorkEntry[]).map(workEntryToFormEntry) : []
                        ])
                    );

                    setSubmission(sub);
                    setPastWork(restoredPastWork);
                    setPresentWork(restoredPresentWork);
                    setFutureWork(restoredFutureWork);
                    setBlockers(sub.blockers || '');
                    setNotes(sub.notes || '');
                    setMoodRating(sub.mood_rating ?? null);
                    setCustomResponses(restoredCustomResponses);
                    const persistedServerSnapshot: SubmissionAutosaveSnapshot = {
                        version: AUTOSAVE_VERSION,
                        savedAt: 0,
                        pastWork: restoredPastWork,
                        presentWork: restoredPresentWork,
                        futureWork: restoredFutureWork,
                        blockers: sub.blockers || '',
                        notes: sub.notes || '',
                        moodRating: sub.mood_rating ?? null,
                        quickMode: false,
                        quickSummary: '',
                        quickHours: 0,
                        customResponses: restoredCustomResponses,
                        goalsApplied: false,
                    };
                    setPersistedSnapshot(JSON.stringify(persistedServerSnapshot));
                })
                .catch((err) => setError(err.message))
                .finally(() => setIsLoading(false));
        }
    }, [isAuthenticated, submissionId]);

    // Load files from Drive for the current week
    useEffect(() => {
        if (isAuthenticated && (weekInfo || submission)) {
            if (!canEdit) {
                setDriveFiles([]);
                setFilesLoading(false);
                setFileAccessNotice('Your file access window has expired. Contact an admin if you need to upload, download, or manage files for this submission.');
                return;
            }

            const targetWeek = submission?.week_id || weekInfo?.week_id;
            if (targetWeek) {
                setFilesLoading(true);
                setFileAccessNotice(null);
                api.listFiles({ week_id: targetWeek })
                    .then(setDriveFiles)
                    .catch(() => {
                        setDriveFiles([]);
                        setFileAccessNotice('Files could not be loaded right now.');
                    })
                    .finally(() => setFilesLoading(false));
            }
        }
    }, [canEdit, isAuthenticated, weekInfo, submission]);

    useEffect(() => {
        setPendingRecovery(null);
        setRecoveryChecked(false);
        setLastAutosavedAt(null);
        setPersistedSnapshot(null);
    }, [autosaveKey]);

    useEffect(() => {
        if (!autosaveKey || isLoading || !isEditing || !canPersistSubmission || recoveryChecked) {
            return;
        }

        const savedDraft = window.localStorage.getItem(autosaveKey);
        if (!savedDraft) {
            setRecoveryChecked(true);
            return;
        }

        try {
            const parsed = JSON.parse(savedDraft) as SubmissionAutosaveSnapshot;
            if (parsed.version !== AUTOSAVE_VERSION || !hasSnapshotContent(parsed)) {
                window.localStorage.removeItem(autosaveKey);
                setLastAutosavedAt(null);
            } else {
                setPendingRecovery(parsed);
                setLastAutosavedAt(parsed.savedAt);
            }
        } catch {
            window.localStorage.removeItem(autosaveKey);
            setLastAutosavedAt(null);
        } finally {
            setRecoveryChecked(true);
        }
    }, [autosaveKey, canPersistSubmission, isEditing, isLoading, recoveryChecked]);

    const buildAutosaveSnapshot = useCallback((savedAt = Date.now()): SubmissionAutosaveSnapshot => ({
        version: AUTOSAVE_VERSION,
        savedAt,
        pastWork,
        presentWork,
        futureWork,
        blockers,
        notes,
        moodRating,
        quickMode,
        quickSummary,
        quickHours,
        customResponses,
        goalsApplied,
    }), [
        blockers,
        customResponses,
        futureWork,
        goalsApplied,
        moodRating,
        notes,
        pastWork,
        presentWork,
        quickHours,
        quickMode,
        quickSummary,
    ]);

    useEffect(() => {
        if (!autosaveKey || !recoveryChecked || pendingRecovery || !isEditing || !canPersistSubmission) {
            return;
        }

        const snapshot = buildAutosaveSnapshot();
        const serializedSnapshot = JSON.stringify({ ...snapshot, savedAt: 0 });

        if (!hasSnapshotContent(snapshot)) {
            window.localStorage.removeItem(autosaveKey);
            setLastAutosavedAt(null);
            return;
        }

        if (serializedSnapshot === persistedSnapshot) {
            window.localStorage.removeItem(autosaveKey);
            setLastAutosavedAt(null);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            window.localStorage.setItem(autosaveKey, JSON.stringify(snapshot));
            setLastAutosavedAt(snapshot.savedAt);
        }, AUTOSAVE_DELAY_MS);

        return () => window.clearTimeout(timeoutId);
    }, [
        autosaveKey,
        blockers,
        buildAutosaveSnapshot,
        canPersistSubmission,
        customResponses,
        futureWork,
        goalsApplied,
        isEditing,
        moodRating,
        notes,
        pastWork,
        pendingRecovery,
        presentWork,
        quickHours,
        quickMode,
        quickSummary,
        recoveryChecked,
        persistedSnapshot,
    ]);

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

    const prepareCustomResponses = () => {
        const payload: Record<string, WorkEntry[]> = {};
        for (const [key, entries] of Object.entries(customResponses)) {
            payload[key] = prepareEntries(entries);
        }
        return payload;
    };

    const clearAutosave = () => {
        if (!autosaveKey) {
            return;
        }
        setPersistedSnapshot(JSON.stringify(buildAutosaveSnapshot(0)));
        window.localStorage.removeItem(autosaveKey);
        setPendingRecovery(null);
        setLastAutosavedAt(null);
        setRecoveryChecked(true);
    };

    const applyRecoveredDraft = (snapshot: SubmissionAutosaveSnapshot) => {
        setPastWork(snapshot.pastWork.length > 0 ? snapshot.pastWork : [createEntry()]);
        setPresentWork(snapshot.presentWork.length > 0 ? snapshot.presentWork : [createEntry()]);
        setFutureWork(snapshot.futureWork.length > 0 ? snapshot.futureWork : [createEntry()]);
        setBlockers(snapshot.blockers);
        setNotes(snapshot.notes);
        setMoodRating(snapshot.moodRating);
        setQuickMode(snapshot.quickMode);
        setQuickSummary(snapshot.quickSummary);
        setQuickHours(snapshot.quickHours);
        setCustomResponses(snapshot.customResponses);
        setGoalsApplied(snapshot.goalsApplied);
        setPendingRecovery(null);
        setLastAutosavedAt(snapshot.savedAt);
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
                    custom_responses: prepareCustomResponses(),
                };
            const result = await api.createOrUpdateSubmission(payload);
            setSubmission(result);
            clearAutosave();
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
                    custom_responses: prepareCustomResponses(),
                };
            const sub = await api.createOrUpdateSubmission(payload);
            await api.submitSubmission(sub.id);
            clearAutosave();
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
                .catch(() => { });
        }
    };

    if (authLoading || isLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    const displayWeekId = targetWeekId;
    const displayDateRange = submission
        ? `${format(parseISO(submission.week_start), 'MMM d')} - ${format(parseISO(submission.week_end), 'MMM d, yyyy')}`
        : weekInfo
            ? `${format(parseISO(weekInfo.week_start), 'MMM d')} - ${format(parseISO(weekInfo.week_end), 'MMM d, yyyy')}`
            : '';
    const submissionWindowNotice = isBeforeSubmissionWindow && submissionWindowStart
        ? {
            tone: 'info' as const,
            message: `This week's update opens ${format(submissionWindowStart, 'EEE, MMM d')} at ${format(submissionWindowStart, 'p')}. You can draft ideas here, but saving and submitting stay disabled until the window opens.`,
        }
        : isClosedAfterDeadline && submissionDeadline
            ? {
                tone: 'warning' as const,
                message: `This week's submission window closed on ${format(submissionDeadline, 'EEE, MMM d')} at ${format(submissionDeadline, 'p')}. Contact an admin if it needs to be reopened.`,
            }
            : isLateSubmissionMode && submissionDeadline
                ? {
                    tone: 'info' as const,
                    message: `The regular deadline passed on ${format(submissionDeadline, 'EEE, MMM d')} at ${format(submissionDeadline, 'p')}, but late submissions are still allowed right now.`,
                }
                : null;
    const actionHelperText = isSubmissionWindowLocked
        ? 'This week is currently view-only, so saving and submitting are disabled.'
        : isLateSubmissionMode
            ? 'Late submissions are currently allowed. Save a draft or submit when this update is ready.'
            : "Save a draft to keep working later, or submit when this week's update looks complete.";
    const detailedSectionEntries = settings?.form_sections.map((section) => {
        if (section.id === 'past') return pastWork;
        if (section.id === 'present') return presentWork;
        if (section.id === 'future') return futureWork;
        return customResponses[section.id] || [createEntry()];
    }) || [];
    const completionSummary = quickMode
        ? {
            completed: [
                Boolean(quickSummary.trim() || quickHours > 0),
                Boolean(blockers.trim() || notes.trim()),
                moodRating !== null,
            ].filter(Boolean).length,
            total: 3,
        }
        : {
            completed:
                detailedSectionEntries.filter(hasFilledEntries).length
                + (blockers.trim() || notes.trim() ? 1 : 0)
                + (moodRating !== null ? 1 : 0),
            total: detailedSectionEntries.length + 2,
        };
    const progressPercent = completionSummary.total > 0
        ? Math.round((completionSummary.completed / completionSummary.total) * 100)
        : 0;

    return (
        <div className="page-wrapper">
            <Navbar />
            <main id="main-content" className="main-content">
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
                                {!isEditing && canPersistSubmission && (
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

                    {submissionWindowNotice && (
                        <div
                            style={{
                                background: submissionWindowNotice.tone === 'warning' ? 'var(--color-warning-bg, #FEF3C7)' : '#EFF6FF',
                                color: submissionWindowNotice.tone === 'warning' ? 'var(--color-text-primary)' : '#1D4ED8',
                                padding: '1rem 1.25rem',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: '1.5rem',
                                border: submissionWindowNotice.tone === 'warning'
                                    ? '1px solid var(--color-warning, #F59E0B)'
                                    : '1px solid #BFDBFE',
                            }}
                        >
                            <p style={{ margin: 0, fontWeight: 600 }}>
                                {submissionWindowNotice.message}
                            </p>
                        </div>
                    )}

                    {/* ── Carry-Forward Goals Banner ──────────────── */}
                    {pendingRecovery && (
                        <div
                            style={{
                                background: 'var(--color-warning-bg, #FEF3C7)',
                                color: 'var(--color-text-primary)',
                                padding: '1rem 1.25rem',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: '1rem',
                                border: '1px solid var(--color-warning, #F59E0B)',
                            }}
                        >
                            <div className="flex justify-between items-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                                <div>
                                    <p style={{ margin: 0, fontWeight: 600 }}>Local draft found</p>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        Restore your unsaved changes from {format(new Date(pendingRecovery.savedAt), 'MMM d, yyyy h:mm a')} or discard them.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" size="sm" type="button" onClick={() => applyRecoveredDraft(pendingRecovery)}>
                                        Restore draft
                                    </Button>
                                    <Button variant="ghost" size="sm" type="button" onClick={clearAutosave}>
                                        Discard
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {isEditing && !pendingRecovery && (
                        <Card style={{ marginBottom: '1.25rem', background: 'linear-gradient(180deg, #fffdf7 0%, #ffffff 100%)', border: '1px solid rgba(219, 169, 40, 0.2)' }}>
                            <div className="flex justify-between items-center" style={{ gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                                        Submission progress
                                    </p>
                                    <h3 style={{ margin: '0.35rem 0 0', fontSize: '1.1rem' }}>
                                        {completionSummary.completed} of {completionSummary.total} sections completed
                                    </h3>
                                </div>
                                <div style={{ minWidth: '240px', flex: '1 1 260px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.45rem' }}>
                                        <span>{quickMode ? 'Quick check-in mode' : 'Detailed weekly update'}</span>
                                        <strong>{progressPercent}%</strong>
                                    </div>
                                    <div style={{ height: '0.55rem', borderRadius: '999px', background: 'var(--color-bg-secondary)', overflow: 'hidden' }}>
                                        <div style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--gradient-gold)', borderRadius: '999px' }} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                        {lastAutosavedAt
                                            ? `Autosaved locally at ${format(new Date(lastAutosavedAt), 'h:mm a')}.`
                                            : 'Autosave will start once you add work details.'}
                                    </p>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                        Save a draft anytime. You can come back later before submitting for review.
                                    </p>
                                </div>
                                {lastAutosavedAt && (
                                    <button
                                        type="button"
                                        onClick={clearAutosave}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: 'var(--color-text-secondary)',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            padding: 0,
                                        }}
                                    >
                                        Clear local draft
                                    </button>
                                )}
                            </div>
                        </Card>
                    )}

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
                    )}{/* ── Quick Check-in Toggle ──────────────────── */}
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

                    {/* ── Dynamic Form Sections (Admin Controllable Architecture) ──── */}
                    {!quickMode && settings && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '1.5rem' }}>
                            {settings.form_sections.map((section: FormSection) => {
                                let stateProps: FormEntry[] = [];
                                let setProps: EntrySetter = () => undefined;

                                if (section.id === 'past') {
                                    stateProps = pastWork;
                                    setProps = setPastWork;
                                } else if (section.id === 'present') {
                                    stateProps = presentWork;
                                    setProps = setPresentWork;
                                } else if (section.id === 'future') {
                                    stateProps = futureWork;
                                    setProps = setFutureWork;
                                } else {
                                    stateProps = customResponses[section.id] || [createEntry()];
                                    setProps = (valOrUpdater) => setCustomResponses(prev => ({
                                        ...prev,
                                        [section.id]: typeof valOrUpdater === 'function' ? valOrUpdater(prev[section.id] || [createEntry()]) : valOrUpdater
                                    }));
                                }

                                return (
                                    <Card key={section.id} style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                        <div style={{ background: 'var(--color-bg-secondary)', padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{ fontSize: '1.25rem' }}>{section.icon}</span>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{section.title}</h3>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{section.subtitle}</p>
                                            </div>
                                        </div>
                                        <div style={{ padding: '1.5rem' }}>
                                            {isEditing ? (
                                                <WorkEntryList entries={stateProps} setEntries={setProps} showHours={section.showHours} onChange={handleEntryChange} categories={categories} />
                                            ) : (
                                                <ReadOnlyEntries entries={stateProps} showHours={section.showHours} />
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}

                            <Card style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                <div style={{ background: 'var(--color-bg-secondary)', padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontSize: '1.25rem' }}>📝</span>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>Additional Information</h3>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blockers & Variables</p>
                                    </div>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    {isEditing ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>Blockers (if any)</label>
                                                <Textarea placeholder="Are there any obstacles preventing your progress?" value={blockers} onChange={(e) => setBlockers(e.target.value)} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>Notes</label>
                                                <Textarea placeholder="Any other notes, thoughts, or ideas?" value={notes} onChange={(e) => setNotes(e.target.value)} />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            {blockers && (
                                                <div style={{ background: 'var(--color-error-bg)', padding: '1rem', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-error)' }}>
                                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-error)', textTransform: 'uppercase' }}>Blockers</p>
                                                    <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>{blockers}</p>
                                                </div>
                                            )}
                                            {notes && (
                                                <div style={{ background: 'var(--color-info-bg)', padding: '1rem', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-info)' }}>
                                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>Notes</p>
                                                    <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>{notes}</p>
                                                </div>
                                            )}
                                            {!blockers && !notes && (
                                                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)' }}>
                                                    No additional notes provided.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* ── Files Section ─────────────────────────── */}
                    <Card style={{ marginBottom: '1.5rem' }}>
                        <CardHeader>
                            <CardTitle>📁 Files & Attachments</CardTitle>
                        </CardHeader>
                        <div style={{ padding: '0 1rem 1rem' }}>
                            {fileAccessNotice && (
                                <div style={{
                                    marginBottom: '1rem',
                                    padding: '0.85rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'var(--color-warning-bg)',
                                    color: 'var(--color-text-primary)',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    fontSize: '0.875rem',
                                }}>
                                    {fileAccessNotice}
                                </div>
                            )}
                            {/* Upload form — only in edit mode */}
                            {isEditing && (
                                <>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                        Upload supporting documents for this week. Safe document, spreadsheet, image, and PDF files work best.
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
                        <div style={{ padding: '1.5rem', background: 'white', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
                            <div className="flex justify-between items-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                                <div>
                                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>Ready when you are</p>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                        {actionHelperText}
                                    </p>
                                </div>
                                <Button variant="ghost" onClick={() => submissionId ? setIsEditing(false) : navigate('/dashboard')} disabled={isSubmitting}>
                                    Cancel
                                </Button>
                            </div>
                            <div className="flex gap-3" style={{ justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' }}>
                                <Button variant="secondary" onClick={handleSaveDraft} disabled={isSubmitting || !canPersistSubmission} isLoading={isSubmitting}>
                                    <Save size={18} /> Save Draft
                                </Button>
                                <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !canPersistSubmission} isLoading={isSubmitting}>
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

function hasFilledEntries(entries: FormEntry[]) {
    return entries.some((entry) => {
        return Boolean(
            entry.description.trim() ||
            entry.hours > 0 ||
            entry.drive_link.trim() ||
            entry.tags.length > 0
        );
    });
}

function hasSnapshotContent(snapshot: SubmissionAutosaveSnapshot) {
    if (snapshot.quickMode && (snapshot.quickSummary.trim() || snapshot.quickHours > 0)) {
        return true;
    }

    return [
        hasFilledEntries(snapshot.pastWork),
        hasFilledEntries(snapshot.presentWork),
        hasFilledEntries(snapshot.futureWork),
        Object.values(snapshot.customResponses).some(hasFilledEntries),
        Boolean(snapshot.blockers.trim()),
        Boolean(snapshot.notes.trim()),
        snapshot.moodRating !== null,
    ].some(Boolean);
}

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {entries.map((entry, index) => (
                <div key={entry.id} style={{ paddingBottom: index < entries.length - 1 ? '1.25rem' : '0', borderBottom: index < entries.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <div className="flex items-start" style={{ gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <div style={{ flex: '1 1 250px' }}>
                            <Input
                                placeholder="Describe what you worked on..."
                                value={entry.description}
                                onChange={(e) => onChange(entry.id, 'description', e.target.value, setEntries)}
                            />
                        </div>
                        {showHours && (
                            <div style={{ width: '100px', flexShrink: 0 }}>
                                <div style={{ position: 'relative' }}>
                                    <Clock size={16} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        placeholder="Hours"
                                        value={entry.hours || ''}
                                        onChange={(e) => onChange(entry.id, 'hours', parseFloat(e.target.value) || 0, setEntries)}
                                        className="form-input"
                                        style={{ padding: '0.5rem 0.5rem 0.5rem 2.25rem', fontWeight: 600, width: '100%' }}
                                    />
                                </div>
                            </div>
                        )}
                        {entries.length > 1 && (
                            <Button variant="ghost" onClick={() => setEntries(prev => prev.filter(e => e.id !== entry.id))} style={{ padding: '0.5rem', color: 'var(--color-error)' }}>
                                <Trash2 size={18} />
                            </Button>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <LinkIcon size={16} style={{ color: 'var(--color-text-muted)' }} />
                        <input
                            type="url"
                            placeholder="Link to Drive file, Docs, or external resource (optional)"
                            value={entry.drive_link}
                            onChange={(e) => onChange(entry.id, 'drive_link', e.target.value, setEntries)}
                            className="form-input"
                            style={{ padding: '0.4rem 0.5rem', fontSize: '0.85rem', flex: 1 }}
                        />
                    </div>
                    {/* Category Tags */}
                    {categories.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {categories.map((cat) => {
                                const isSelected = entry.tags.includes(cat);
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => toggleTag(entry.id, cat)}
                                        style={{
                                            fontSize: '0.72rem',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '999px',
                                            border: isSelected ? '1px solid var(--color-primary-gold)' : '1px solid var(--color-border)',
                                            background: isSelected ? 'var(--color-primary-gold-light, #FDF4D9)' : 'white',
                                            color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                            fontWeight: isSelected ? 600 : 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        <Tag size={10} style={{ display: 'inline', marginRight: '0.2rem' }} />
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                <Button variant="outline" onClick={() => setEntries(prev => [...prev, createEntry()])} style={{ borderRadius: '999px', padding: '0.4rem 1.2rem', fontSize: '0.8rem' }}>
                    <Plus size={16} style={{ marginRight: '0.4rem' }} /> Add Another Entry
                </Button>
            </div>
        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
