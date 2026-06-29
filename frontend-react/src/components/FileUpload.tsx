import React, { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import type { FileUploadContext, UploadedFile } from '../lib/api';
import { Upload, X, FileText, Check, AlertCircle, Download, Eye, ZoomIn, ZoomOut } from 'lucide-react';

function isPreviewable(mimeType?: string): boolean {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

function getFileIcon(mimeType?: string) {
    if (!mimeType) return <FileText size={20} />;
    if (mimeType.startsWith('image/')) return <span style={{ fontSize: '1.1rem' }}>🖼️</span>;
    if (mimeType === 'application/pdf') return <span style={{ fontSize: '1.1rem' }}>📄</span>;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return <span style={{ fontSize: '1.1rem' }}>📊</span>;
    if (mimeType.includes('word') || mimeType.includes('document')) return <span style={{ fontSize: '1.1rem' }}>📝</span>;
    return <FileText size={20} />;
}

const BLOCKED_UPLOAD_EXTENSIONS = new Set([
    'app',
    'bat',
    'cmd',
    'com',
    'cpl',
    'exe',
    'hta',
    'jar',
    'js',
    'lnk',
    'msi',
    'ps1',
    'scr',
    'sh',
    'vb',
    'vbe',
    'vbs',
]);

const actionBtnStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--color-primary-gold)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
};

const toolbarBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'rgba(255,255,255,0.8)',
    padding: '0.35rem',
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
};

function FileRow({
    file, onPreview, onDownload, onDelete, canDelete, leadEmail,
}: {
    file: UploadedFile;
    onPreview: () => void;
    onDownload: () => void;
    onDelete?: () => void;
    canDelete?: boolean;
    leadEmail?: string;
}) {
    const canPreview = isPreviewable(file.mime_type);
    const requestSubject = encodeURIComponent(`Request to remove file: ${file.filename}`);
    const requestBody = encodeURIComponent(`Hi,\n\nCould you please remove the file "${file.filename}" from the project?\n\nThank you.`);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <span style={{ flexShrink: 0, color: 'var(--color-text-muted)' }}>{getFileIcon(file.mime_type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {file.filename}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                    {canPreview && (
                        <button type="button" onClick={onPreview} style={actionBtnStyle}>
                            <Eye size={12} /> Preview
                        </button>
                    )}
                    <button type="button" onClick={onDownload} style={actionBtnStyle}>
                        <Download size={12} /> Download
                    </button>
                    {!canDelete && leadEmail && (
                        <a
                            href={`mailto:${leadEmail}?subject=${requestSubject}&body=${requestBody}`}
                            style={{ ...actionBtnStyle, color: '#94a3b8', textDecoration: 'none' }}
                        >
                            Request removal
                        </a>
                    )}
                    {file.uploaded_by_name && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Added by {file.uploaded_by_name}</span>
                    )}
                </div>
            </div>
            {canDelete && onDelete && (
                <button
                    type="button"
                    onClick={onDelete}
                    title="Delete file"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#ef4444', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
}

interface FileUploadProps {
    weekId?: string;
    projectId?: string;
    submissionId?: string;
    workItemId?: string;
    sourceType?: FileUploadContext['source_type'];
    onFileUploaded?: (file: UploadedFile) => void;
    maxFiles?: number;
    disabled?: boolean;
    disabledMessage?: string;
    canDelete?: boolean;
    leadEmail?: string;
    /** Called before the first upload when submissionId is not yet set. Return the resolved submissionId, or null to abort. */
    onBeforeUpload?: () => Promise<string | null>;
}

interface UploadingFile {
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    result?: UploadedFile;
    error?: string;
}

export function FileUpload({
    weekId,
    projectId,
    submissionId,
    workItemId,
    sourceType,
    onFileUploaded,
    maxFiles = 10,
    disabled = false,
    disabledMessage,
    canDelete = false,
    leadEmail,
    onBeforeUpload,
}: FileUploadProps) {
    const [files, setFiles] = useState<UploadingFile[]>([]);
    const [persistedFiles, setPersistedFiles] = useState<UploadedFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);

    const [storageType, setStorageType] = useState<'shared_drive' | 's3' | 'local' | null>(null);
    const [folderName, setFolderName] = useState<string | null>(null);

    // Preview state
    const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
    const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [imgZoom, setImgZoom] = useState(1);
    const uploadContext: FileUploadContext = {
        week_id: weekId,
        project_id: projectId,
        submission_id: submissionId,
        work_item_id: workItemId,
        source_type: sourceType,
    };

    // Check Drive status on first interaction
    const checkDriveStatus = useCallback(async () => {
        if (driveConfigured === null) {
            try {
                const status = await api.getDriveStatus();
                setDriveConfigured(status.configured);
                setStorageType(status.storage_type);
                setFolderName(status.folder_name || null);
            } catch {
                setDriveConfigured(false);
                setStorageType('local');
            }
        }
    }, [driveConfigured]);

    useEffect(() => {
        let cancelled = false;

        const loadPersistedFiles = async () => {
            if (!submissionId && !projectId) {
                setPersistedFiles([]);
                return;
            }

            try {
                const loadedFiles = submissionId
                    ? await api.listSubmissionFiles(submissionId)
                    : await api.listProjectFiles(projectId!);

                if (!cancelled) {
                    setPersistedFiles(loadedFiles);
                }
            } catch (error) {
                console.error('Failed to load attached files', error);
                if (!cancelled) {
                    setPersistedFiles([]);
                }
            }
        };

        void loadPersistedFiles();
        return () => {
            cancelled = true;
        };
    }, [projectId, submissionId]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (disabled) return;
        setIsDragging(true);
        checkDriveStatus();
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;

        const droppedFiles = Array.from(e.dataTransfer.files);
        await uploadFiles(droppedFiles);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (disabled) return;
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            await uploadFiles(selectedFiles);
            e.target.value = ''; // Reset input
        }
    };

    const uploadFiles = async (newFiles: File[]) => {
        if (disabled) {
            return;
        }

        // If there's no submissionId yet, auto-save a draft first
        let effectiveSubmissionId = submissionId;
        if (!effectiveSubmissionId && onBeforeUpload) {
            const resolved = await onBeforeUpload();
            if (!resolved) return;
            effectiveSubmissionId = resolved;
        }

        const effectiveContext: FileUploadContext = effectiveSubmissionId !== submissionId
            ? { ...uploadContext, submission_id: effectiveSubmissionId }
            : uploadContext;

        await checkDriveStatus();

        const rejectedFiles: UploadingFile[] = newFiles
            .filter((file) => {
                const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
                return Boolean(extension && BLOCKED_UPLOAD_EXTENSIONS.has(extension));
            })
            .map((file) => ({
                file,
                status: 'error' as const,
                error: 'Executable and script files are blocked. Upload documents, images, spreadsheets, or PDFs instead.',
            }));

        if (rejectedFiles.length > 0) {
            setFiles((prev) => [...prev, ...rejectedFiles]);
        }

        // Limit number of files
        const remainingSlots = maxFiles - (persistedFiles.length + files.filter(f => f.status === 'success').length);
        const filesToUpload = newFiles
            .filter((file) => {
                const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
                return !extension || !BLOCKED_UPLOAD_EXTENSIONS.has(extension);
            })
            .slice(0, remainingSlots);

        // Add files to state with pending status
        const uploadingFiles: UploadingFile[] = filesToUpload.map(file => ({
            file,
            status: 'pending' as const,
        }));

        setFiles(prev => [...prev, ...uploadingFiles]);

        // Upload each file
        for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            const fileIndex = files.length + i;

            setFiles(prev => prev.map((f, idx) =>
                idx === fileIndex ? { ...f, status: 'uploading' as const } : f
            ));

            try {
                const result = await api.uploadFile(file, effectiveContext);

                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? { ...f, status: 'success' as const, result } : f
                ));
                setPersistedFiles(prev => prev.some((existing) => existing.file_id === result.file_id) ? prev : [...prev, result]);

                if (onFileUploaded) {
                    onFileUploaded(result);
                }
            } catch (error) {
                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? {
                        ...f,
                        status: 'error' as const,
                        error: error instanceof Error ? error.message : 'Upload failed'
                    } : f
                ));
            }
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const successfulUploads = files.filter(f => f.status === 'success');
    const visibleSessionFiles = files.filter((file) => file.status !== 'success');

    const openUploadedFile = async (uploadedFile: UploadedFile) => {
        try {
            const { url } = await api.getFileDownloadLink(uploadedFile.file_id);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
            window.open(uploadedFile.drive_link, '_blank', 'noopener,noreferrer');
        }
    };

    const openPreview = async (uploadedFile: UploadedFile) => {
        setPreviewFile(uploadedFile);
        setPreviewObjectUrl(null);
        setIsLoadingPreview(true);
        setImgZoom(1);
        try {
            const blob = await api.downloadFile(uploadedFile.file_id);
            setPreviewObjectUrl(URL.createObjectURL(blob));
        } catch {
            setPreviewFile(null);
            await openUploadedFile(uploadedFile);
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const closePreview = () => {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        setPreviewFile(null);
        setPreviewObjectUrl(null);
        setIsLoadingPreview(false);
    };

    const deletePersistedFile = async (file: UploadedFile) => {
        if (!window.confirm(`Delete "${file.filename}"? This cannot be undone.`)) return;
        try {
            await api.deleteFile(file.file_id);
            setPersistedFiles(prev => prev.filter(f => f.file_id !== file.file_id));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete file.');
        }
    };

    const getStorageText = () => {
        if (storageType === 'shared_drive') return `Files uploaded to Guardian's Drive${folderName ? ` -> ${folderName}` : ''}`;
        if (storageType === 's3') return 'Files upload directly to secure cloud storage';
        return 'Files will be stored securely on the server';
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            {/* Drop Zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                    if (!disabled) {
                        void checkDriveStatus();
                    }
                }}
                style={{
                    border: `2px dashed ${disabled ? 'var(--color-border)' : isDragging ? 'var(--color-primary-gold)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '2rem',
                    textAlign: 'center',
                    background: disabled ? 'var(--color-bg-secondary)' : isDragging ? 'var(--color-primary-gold-light)' : 'var(--color-bg-secondary)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: disabled ? 0.7 : 1,
                }}
            >
                <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="file-upload-input"
                    disabled={disabled}
                />
                <label htmlFor="file-upload-input" style={{ cursor: disabled ? 'not-allowed' : 'pointer', display: 'block' }}>
                    <Upload
                        size={40}
                        style={{
                            color: disabled ? 'var(--color-text-muted)' : isDragging ? 'var(--color-primary-gold)' : 'var(--color-text-muted)',
                            marginBottom: '0.5rem'
                        }}
                    />
                    <p style={{ margin: 0, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {disabled ? 'Attachments are currently disabled' : 'Drag & drop files here, or click to select'}
                    </p>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {disabled ? (disabledMessage || 'Save your draft first to attach files.') : getStorageText()}
                    </p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        Max 25 MB per file. Executable and script files are blocked.
                    </p>
                </label>
            </div>

            {/* Storage Info/Warning */}
            <div style={{
                marginTop: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
            }}>
                {storageType === 'local' && (
                    <div style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} />
                        <span>Storage: Local Server</span>
                    </div>
                )}
                {(storageType === 'shared_drive' || storageType === 's3') && (
                    <div style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Check size={16} />
                        <span>Storage: {storageType === 'shared_drive' ? 'Guardian\'s Drive' : 'AWS S3'}</span>
                    </div>
                )}
            </div>

            {persistedFiles.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Attached Files ({persistedFiles.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {persistedFiles.map((persistedFile) => (
                            <FileRow
                                key={persistedFile.project_file_id || persistedFile.file_id}
                                file={persistedFile}
                                onPreview={() => { void openPreview(persistedFile); }}
                                onDownload={() => { void openUploadedFile(persistedFile); }}
                                onDelete={() => { void deletePersistedFile(persistedFile); }}
                                canDelete={canDelete}
                                leadEmail={leadEmail}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Session upload list */}
            {visibleSessionFiles.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Uploaded Files ({successfulUploads.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {visibleSessionFiles.map((uploadingFile, index) => (
                            <div
                                key={index}
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
                                <span style={{ flexShrink: 0 }}>{getFileIcon(uploadingFile.result?.mime_type)}</span>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {uploadingFile.file.name}
                                    </p>

                                    {uploadingFile.status === 'uploading' && (
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-primary-gold)' }}>Uploading...</p>
                                    )}
                                    {uploadingFile.status === 'error' && (
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-error)' }}>{uploadingFile.error}</p>
                                    )}
                                    {uploadingFile.status === 'success' && uploadingFile.result && (
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.2rem' }}>
                                            {isPreviewable(uploadingFile.result.mime_type) && (
                                                <button type="button" onClick={() => { void openPreview(uploadingFile.result!); }} style={actionBtnStyle}>
                                                    <Eye size={12} /> Preview
                                                </button>
                                            )}
                                            <button type="button" onClick={() => { void openUploadedFile(uploadingFile.result!); }} style={actionBtnStyle}>
                                                <Download size={12} /> Download
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {uploadingFile.status === 'uploading' && <div className="spinner" style={{ width: 20, height: 20 }} />}
                                {uploadingFile.status === 'success' && <Check size={20} style={{ color: 'var(--color-success)', flexShrink: 0 }} />}
                                {uploadingFile.status === 'error' && <AlertCircle size={20} style={{ color: 'var(--color-error)', flexShrink: 0 }} />}

                                <button onClick={() => removeFile(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-muted)', flexShrink: 0 }} title="Remove">
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {previewFile && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}
                    onClick={(e) => { if (e.target === e.currentTarget) closePreview(); }}
                >
                    {/* Toolbar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                        <span style={{ flexShrink: 0 }}>{getFileIcon(previewFile.mime_type)}</span>
                        <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {previewFile.filename}
                        </span>
                        {previewObjectUrl && previewFile.mime_type?.startsWith('image/') && (
                            <>
                                <button onClick={() => setImgZoom(z => Math.max(0.25, z - 0.25))} style={toolbarBtnStyle} title="Zoom out"><ZoomOut size={18} /></button>
                                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', minWidth: '3rem', textAlign: 'center' }}>{Math.round(imgZoom * 100)}%</span>
                                <button onClick={() => setImgZoom(z => Math.min(4, z + 0.25))} style={toolbarBtnStyle} title="Zoom in"><ZoomIn size={18} /></button>
                            </>
                        )}
                        <button onClick={() => { void openUploadedFile(previewFile); }} style={{ ...toolbarBtnStyle, gap: '0.4rem', fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderRadius: '0.4rem', background: 'rgba(255,255,255,0.1)' }}>
                            <Download size={14} /> Download
                        </button>
                        <button onClick={closePreview} style={toolbarBtnStyle} title="Close"><X size={20} /></button>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                        {isLoadingPreview && (
                            <div style={{ color: 'white', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <div className="spinner" style={{ width: 36, height: 36, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
                                Loading preview…
                            </div>
                        )}
                        {!isLoadingPreview && previewObjectUrl && previewFile.mime_type?.startsWith('image/') && (
                            <img
                                src={previewObjectUrl}
                                alt={previewFile.filename}
                                style={{ maxWidth: '100%', transform: `scale(${imgZoom})`, transformOrigin: 'center', transition: 'transform 0.15s', display: 'block', borderRadius: '4px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                            />
                        )}
                        {!isLoadingPreview && previewObjectUrl && previewFile.mime_type === 'application/pdf' && (
                            <iframe
                                src={previewObjectUrl}
                                title={previewFile.filename}
                                style={{ width: '100%', height: '100%', border: 'none', borderRadius: '4px', minHeight: '70vh' }}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default FileUpload;
